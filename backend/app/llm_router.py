from __future__ import annotations

import os
import re
import subprocess
import time
from typing import Any

import httpx

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
LOCAL_MODEL_CATALOG: tuple[dict[str, Any], ...] = (
    {
        "id": "hf.co/Mungert/sarvam-m-GGUF:Q4_K_M",
        "label": "Sarvam M",
        "role": "indic_chat",
        "auto_chat": True,
    },
    {
        "id": "chetana-guard-fast",
        "label": "Chetana Guard Fast",
        "role": "safety_chat",
        "auto_chat": True,
    },
    {
        "id": "phi4-mini",
        "label": "Phi 4 Mini",
        "role": "fast_chat",
        "auto_chat": True,
    },
    {
        "id": "qwen2.5:7b",
        "label": "Qwen 2.5 7B",
        "role": "general_chat",
        "auto_chat": True,
    },
    {
        "id": "llama3.2:3b",
        "label": "Llama 3.2 3B",
        "role": "compact_chat",
        "auto_chat": True,
    },
    {
        "id": "mirrorstudent:latest",
        "label": "MirrorStudent",
        "role": "house_backup",
        "auto_chat": True,
    },
    {
        "id": "vajra-shield:latest",
        "label": "Vajra Shield",
        "role": "safety_reserve",
        "auto_chat": False,
    },
    {
        "id": "hf.co/mradermacher/sarvam-translate-i1-GGUF:Q4_K_M",
        "label": "Sarvam Translate",
        "role": "translation",
        "auto_chat": False,
    },
    {
        "id": "qwen2.5vl:7b",
        "label": "Qwen 2.5 VL 7B",
        "role": "multimodal_reserve",
        "auto_chat": False,
    },
)
LOCAL_MODEL_BY_ID = {entry["id"]: entry for entry in LOCAL_MODEL_CATALOG}
DEFAULT_LOCAL_CHAT_MODELS = (
    "phi4-mini",
    "mirrorstudent:latest",
    "hf.co/Mungert/sarvam-m-GGUF:Q4_K_M",
    "chetana-guard-fast",
    "qwen2.5:7b",
    "llama3.2:3b",
)
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"
DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest"
_SECRET_CACHE: dict[str, str | None] = {}


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_csv_env(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    parsed = tuple(item.strip() for item in raw.split(",") if item.strip())
    return parsed or default


def _allowlisted_local_models(raw_models: tuple[str, ...]) -> tuple[str, ...]:
    models: list[str] = []
    seen: set[str] = set()
    for model in raw_models:
        if model not in LOCAL_MODEL_BY_ID or model in seen:
            continue
        seen.add(model)
        models.append(model)
    return tuple(models) or DEFAULT_LOCAL_CHAT_MODELS


def _sanitize_prompt(text: str, limit: int) -> str:
    collapsed = re.sub(r"\s+", " ", (text or "")).strip()
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rstrip() + "…"


def _secret(name: str) -> str:
    env_value = os.getenv(name, "").strip()
    if env_value:
        return env_value
    if name in _SECRET_CACHE:
        return _SECRET_CACHE[name] or ""

    commands = (
        ["security", "find-generic-password", "-a", "mirrordna", "-s", name, "-w"],
        ["security", "find-generic-password", "-s", name, "-w"],
    )
    for command in commands:
        try:
            proc = subprocess.run(command, capture_output=True, text=True, timeout=1.5, check=False)
        except Exception:
            continue
        value = (proc.stdout or "").strip()
        if proc.returncode == 0 and value:
            _SECRET_CACHE[name] = value
            return value

    _SECRET_CACHE[name] = None
    return ""


def _settings() -> dict[str, Any]:
    return {
        "local_models": _allowlisted_local_models(
            _parse_csv_env("CHETANA_OLLAMA_CHAT_MODELS", DEFAULT_LOCAL_CHAT_MODELS)
        ),
        "local_timeout_s": float(os.getenv("CHETANA_LOCAL_LLM_TIMEOUT_S", "6")),
        "local_total_budget_s": float(os.getenv("CHETANA_LOCAL_LLM_BUDGET_S", "14")),
        "cloud_enabled": _env_bool("CHETANA_CLOUD_FALLBACK", False),
        "openai_enabled": _env_bool("CHETANA_ENABLE_OPENAI", False),
        "anthropic_enabled": _env_bool("CHETANA_ENABLE_ANTHROPIC", False),
        "openai_model": os.getenv("CHETANA_OPENAI_MODEL", DEFAULT_OPENAI_MODEL).strip() or DEFAULT_OPENAI_MODEL,
        "anthropic_model": os.getenv("CHETANA_ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL).strip() or DEFAULT_ANTHROPIC_MODEL,
        "max_input_chars": int(os.getenv("CHETANA_LLM_MAX_INPUT_CHARS", "1200")),
        "max_output_tokens": int(os.getenv("CHETANA_LLM_MAX_OUTPUT_TOKENS", "400")),
        "gemini_enabled": False,
    }


def _ollama_runtime_models() -> tuple[bool, set[str]]:
    try:
        response = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=0.75)
        response.raise_for_status()
        models = response.json().get("models") or []
    except Exception:
        return False, set()

    names: set[str] = set()
    for item in models:
        if not isinstance(item, dict):
            continue
        for key in ("name", "model"):
            value = str(item.get(key) or "").strip()
            if value:
                names.add(value)
                if value.endswith(":latest"):
                    names.add(value.removesuffix(":latest"))
    return True, names


def ollama_model_available(model: str) -> bool:
    reachable, installed = _ollama_runtime_models()
    return reachable and (model in installed or f"{model}:latest" in installed)


def build_llm_status() -> dict[str, Any]:
    settings = _settings()
    ollama_reachable, installed_models = _ollama_runtime_models()

    def local_available(model: str) -> bool:
        return model in installed_models or f"{model}:latest" in installed_models

    anthropic_enabled = (
        settings["cloud_enabled"]
        and settings["anthropic_enabled"]
        and bool(_secret("ANTHROPIC_API_KEY"))
    )
    openai_enabled = (
        settings["cloud_enabled"]
        and settings["openai_enabled"]
        and bool(_secret("OPENAI_API_KEY"))
    )
    routing = [
        {"provider": "ollama", "model": model, "available": local_available(model)}
        for model in settings["local_models"]
    ]
    if anthropic_enabled:
        routing.append({"provider": "anthropic", "model": settings["anthropic_model"], "available": True})
    if openai_enabled:
        routing.append({"provider": "openai", "model": settings["openai_model"], "available": True})

    available_local_models = [model for model in settings["local_models"] if local_available(model)]
    missing_local_models = [model for model in settings["local_models"] if not local_available(model)]
    cloud_fallback_order = [
        provider
        for provider, enabled in (("anthropic", anthropic_enabled), ("openai", openai_enabled))
        if enabled
    ]
    return {
        "policy": {
            "local_first": True,
            "gemini_enabled": settings["gemini_enabled"],
            "cloud_fallback_enabled": bool(cloud_fallback_order),
            "cloud_tools_enabled": bool(cloud_fallback_order),
            "caller_model_selection": False,
            "max_input_chars": settings["max_input_chars"],
            "max_output_tokens": settings["max_output_tokens"],
            "local_total_budget_s": settings["local_total_budget_s"],
        },
        "routing": {
            "chat_ladder": routing,
            "cloud_fallback_order": cloud_fallback_order,
        },
        "providers": [
            {
                "id": "ollama",
                "enabled": ollama_reachable and bool(available_local_models),
                "reachable": ollama_reachable,
                "models": list(settings["local_models"]),
                "available_models": available_local_models,
                "missing_models": missing_local_models,
                "catalog": [dict(entry) for entry in LOCAL_MODEL_CATALOG],
            },
            {
                "id": "anthropic",
                "enabled": anthropic_enabled,
                "model": settings["anthropic_model"],
            },
            {
                "id": "openai",
                "enabled": openai_enabled,
                "model": settings["openai_model"],
            },
        ],
    }


async def _call_ollama(model: str, prompt: str, system_prompt: str, timeout_s: float) -> str | None:
    async with httpx.AsyncClient(timeout=timeout_s) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "system": system_prompt,
                "stream": False,
                "keep_alive": "5m",
            },
        )
        if resp.status_code != 200:
            return None
        reply = (resp.json().get("response") or "").strip()
        return reply or None


def _anthropic_text(payload: dict[str, Any]) -> str | None:
    parts = payload.get("content") or []
    chunks: list[str] = []
    for part in parts:
        if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
            chunks.append(str(part["text"]).strip())
    text = "\n".join(chunk for chunk in chunks if chunk).strip()
    return text or None


async def _call_anthropic(prompt: str, system_prompt: str, model: str, max_output_tokens: int) -> str | None:
    api_key = _secret("ANTHROPIC_API_KEY")
    if not api_key:
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "system": system_prompt,
                "max_tokens": max_output_tokens,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if resp.status_code != 200:
            return None
        return _anthropic_text(resp.json())


def _openai_text(payload: dict[str, Any]) -> str | None:
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    outputs = payload.get("output") or []
    chunks: list[str] = []
    for item in outputs:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "message":
            for part in item.get("content") or []:
                if isinstance(part, dict) and part.get("type") in {"output_text", "text"} and part.get("text"):
                    chunks.append(str(part["text"]).strip())
        elif item.get("text"):
            chunks.append(str(item["text"]).strip())
    text = "\n".join(chunk for chunk in chunks if chunk).strip()
    return text or None


async def _call_openai(prompt: str, system_prompt: str, model: str, max_output_tokens: int) -> str | None:
    api_key = _secret("OPENAI_API_KEY")
    if not api_key:
        return None
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "instructions": system_prompt,
                "input": prompt,
                "max_output_tokens": max_output_tokens,
            },
        )
        if resp.status_code != 200:
            return None
        return _openai_text(resp.json())


async def generate_chat_reply(prompt: str, system_prompt: str) -> dict[str, str] | None:
    settings = _settings()
    cleaned_prompt = _sanitize_prompt(prompt, settings["max_input_chars"])
    if not cleaned_prompt:
        return None

    started = time.monotonic()
    for model in settings["local_models"]:
        remaining = settings["local_total_budget_s"] - (time.monotonic() - started)
        if remaining <= 0:
            break
        try:
            reply = await _call_ollama(
                model,
                cleaned_prompt,
                system_prompt,
                min(settings["local_timeout_s"], max(1.0, remaining)),
            )
        except Exception:
            reply = None
        if reply:
            return {"text": reply, "provider": "ollama", "model": model}

    if settings["cloud_enabled"] and settings["anthropic_enabled"]:
        try:
            reply = await _call_anthropic(
                cleaned_prompt,
                system_prompt,
                settings["anthropic_model"],
                settings["max_output_tokens"],
            )
        except Exception:
            reply = None
        if reply:
            return {"text": reply, "provider": "anthropic", "model": settings["anthropic_model"]}

    if settings["cloud_enabled"] and settings["openai_enabled"]:
        try:
            reply = await _call_openai(
                cleaned_prompt,
                system_prompt,
                settings["openai_model"],
                settings["max_output_tokens"],
            )
        except Exception:
            reply = None
        if reply:
            return {"text": reply, "provider": "openai", "model": settings["openai_model"]}

    return None
