from __future__ import annotations

import base64
import mimetypes
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

TRUTHY = {"1", "true", "yes", "on"}
DEFAULT_ENDPOINT = "https://api.mistral.ai/v1/ocr"
DEFAULT_MODEL = "mistral-ocr-latest"
DEFAULT_MAX_BYTES = 8 * 1024 * 1024


class MistralOcrUnavailable(RuntimeError):
    pass


class MistralOcrError(RuntimeError):
    pass


@dataclass(frozen=True)
class MistralOcrResult:
    text: str
    provider: str
    model: str
    latency_ms: int
    confidence: float | None
    page_count: int


def mistral_ocr_available() -> bool:
    enabled = os.getenv("CHETANA_MISTRAL_OCR_ENABLED", "").strip().lower() in TRUTHY
    return enabled and bool(os.getenv("MISTRAL_API_KEY", "").strip())


def _max_bytes() -> int:
    try:
        return int(os.getenv("CHETANA_MISTRAL_OCR_MAX_BYTES", str(DEFAULT_MAX_BYTES)))
    except ValueError:
        return DEFAULT_MAX_BYTES


def _timeout_s() -> float:
    try:
        return float(os.getenv("CHETANA_MISTRAL_OCR_TIMEOUT_S", "20"))
    except ValueError:
        return 20.0


def _mime_type(filename: str | None, content_type: str | None) -> str:
    candidate = (content_type or "").split(";", 1)[0].strip().lower()
    if candidate in {"image/jpg", "image/jpeg", "image/png", "image/webp", "application/pdf"}:
        return "image/jpeg" if candidate == "image/jpg" else candidate
    guessed = mimetypes.guess_type(filename or "")[0] or "image/png"
    if guessed == "image/jpg":
        return "image/jpeg"
    if guessed.startswith("image/") or guessed == "application/pdf":
        return guessed
    return "image/png"


def _document_payload(filename: str | None, content_type: str | None, content: bytes) -> dict[str, str]:
    mime = _mime_type(filename, content_type)
    encoded = base64.b64encode(content).decode("ascii")
    data_url = f"data:{mime};base64,{encoded}"
    if mime == "application/pdf":
        return {"type": "document_url", "document_url": data_url}
    return {"type": "image_url", "image_url": data_url}


def _coerce_confidence(value: Any) -> float | None:
    if not isinstance(value, int | float):
        return None
    score = float(value)
    if score > 1:
        score = score / 100
    if score < 0 or score > 1:
        return None
    return round(score, 3)


def _page_confidence(page: dict[str, Any]) -> float | None:
    for key in (
        "average_page_confidence_score",
        "confidence",
        "confidence_score",
        "ocr_confidence",
    ):
        score = _coerce_confidence(page.get(key))
        if score is not None:
            return score
    scores = page.get("confidence_scores")
    if isinstance(scores, list):
        normalized = [_coerce_confidence(item) for item in scores]
        valid = [item for item in normalized if item is not None]
        if valid:
            return round(sum(valid) / len(valid), 3)
    return None


def _extract_ocr_text(payload: dict[str, Any]) -> tuple[str, float | None, int]:
    pages = payload.get("pages")
    if not isinstance(pages, list):
        return "", None, 0

    chunks: list[str] = []
    confidences: list[float] = []
    for page in pages:
        if not isinstance(page, dict):
            continue
        markdown = str(page.get("markdown") or page.get("text") or "").strip()
        if markdown:
            chunks.append(markdown)
        confidence = _page_confidence(page)
        if confidence is not None:
            confidences.append(confidence)

    confidence = round(sum(confidences) / len(confidences), 3) if confidences else None
    return "\n\n".join(chunks).strip(), confidence, len(pages)


async def extract_text_with_mistral_ocr(
    *,
    content: bytes,
    filename: str | None,
    content_type: str | None,
) -> MistralOcrResult:
    if not mistral_ocr_available():
        raise MistralOcrUnavailable("mistral_ocr_not_configured")
    if not content:
        raise MistralOcrError("empty_upload")
    if len(content) > _max_bytes():
        raise MistralOcrError("upload_too_large")

    api_key = os.getenv("MISTRAL_API_KEY", "").strip()
    endpoint = os.getenv("CHETANA_MISTRAL_OCR_ENDPOINT", DEFAULT_ENDPOINT).strip() or DEFAULT_ENDPOINT
    model = os.getenv("CHETANA_MISTRAL_OCR_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    payload = {
        "model": model,
        "document": _document_payload(filename, content_type, content),
        "include_image_base64": False,
    }
    started = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(_timeout_s(), connect=5.0)) as client:
            response = await client.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            response_payload = response.json()
    except httpx.TimeoutException as exc:
        raise MistralOcrError("ocr_timeout") from exc
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code if exc.response is not None else 0
        raise MistralOcrError(f"ocr_http_{status}") from exc
    except httpx.HTTPError as exc:
        raise MistralOcrError("ocr_transport_error") from exc
    except ValueError as exc:
        raise MistralOcrError("ocr_invalid_json") from exc

    text, confidence, page_count = _extract_ocr_text(response_payload)
    return MistralOcrResult(
        text=text,
        provider="mistral",
        model=model,
        latency_ms=max(0, round((time.perf_counter() - started) * 1000)),
        confidence=confidence,
        page_count=page_count,
    )
