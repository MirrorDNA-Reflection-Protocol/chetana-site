"""Bounded local speech-to-text runtime for Chetana voice checks."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import signal
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence
from uuid import uuid4


logger = logging.getLogger("chetana.voice")

VOICE_MAX_BYTES = 8 * 1024 * 1024
VOICE_MAX_DURATION_SECONDS = 30.0
VOICE_CONSENT_TOKEN = "local-voice-consent"

SUPPORTED_AUDIO_TYPES = frozenset(
    {
        "audio/aac",
        "audio/flac",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/opus",
        "audio/wav",
        "audio/webm",
        "audio/x-m4a",
        "audio/x-wav",
        "application/ogg",
    }
)

_AUDIO_SUFFIXES = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-m4a": ".m4a",
    "audio/x-wav": ".wav",
    "application/ogg": ".ogg",
}


class VoiceRuntimeError(RuntimeError):
    """Expected voice-runtime failure with a public-safe error contract."""

    def __init__(self, code: str, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class VoiceRuntimeConfig:
    whisper_cli: str
    ffmpeg: str
    ffprobe: str
    model_path: Path
    max_bytes: int = VOICE_MAX_BYTES
    max_duration_seconds: float = VOICE_MAX_DURATION_SECONDS
    queue_timeout_seconds: float = 1.0
    probe_timeout_seconds: float = 5.0
    decode_timeout_seconds: float = 8.0
    transcription_timeout_seconds: float = 20.0
    max_concurrency: int = 1

    @classmethod
    def from_env(cls) -> "VoiceRuntimeConfig":
        return cls(
            whisper_cli=os.getenv("CHETANA_WHISPER_CLI", "/opt/homebrew/bin/whisper-cli"),
            ffmpeg=os.getenv("CHETANA_FFMPEG", "/opt/homebrew/bin/ffmpeg"),
            ffprobe=os.getenv("CHETANA_FFPROBE", "/opt/homebrew/bin/ffprobe"),
            model_path=Path(
                os.getenv(
                    "CHETANA_VOICE_MODEL_PATH",
                    str(
                        Path.home()
                        / "Library"
                        / "Application Support"
                        / "Chetana"
                        / "models"
                        / "ggml-large-v3-turbo-q5_0.bin"
                    ),
                )
            ),
        )


@dataclass(frozen=True, slots=True)
class VoiceTranscription:
    transcription_id: str
    transcript: str
    language_code: str
    duration_seconds: float
    processing_ms: int
    provider: str = "whisper.cpp"
    model: str = "whisper-large-v3-turbo-q5_0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "transcription_id": self.transcription_id,
            "transcript": self.transcript,
            "language_code": self.language_code,
            "duration_seconds": self.duration_seconds,
            "processing_ms": self.processing_ms,
            "runtime": {
                "provider": self.provider,
                "model": self.model,
                "location": "chetana_host",
                "external_ai_provider": False,
            },
            "privacy": {
                "audio_retained": False,
                "transcript_persisted_by_transcriber": False,
                "temporary_files_deleted": True,
            },
        }


class LocalVoiceRuntime:
    """Decode and transcribe one short voice note at a time."""

    def __init__(self, config: VoiceRuntimeConfig | None = None) -> None:
        self.config = config or VoiceRuntimeConfig.from_env()
        self._semaphore = asyncio.Semaphore(self.config.max_concurrency)

    @staticmethod
    def _command_available(command: str) -> bool:
        path = Path(command).expanduser()
        if path.is_absolute():
            return path.is_file() and os.access(path, os.X_OK)
        return shutil.which(command) is not None

    def status(self) -> dict[str, Any]:
        checks = {
            "whisper_cli": self._command_available(self.config.whisper_cli),
            "ffmpeg": self._command_available(self.config.ffmpeg),
            "ffprobe": self._command_available(self.config.ffprobe),
            "model": self.config.model_path.expanduser().is_file(),
        }
        return {
            "available": all(checks.values()),
            "provider": "whisper.cpp",
            "model": "whisper-large-v3-turbo-q5_0",
            "processing_location": "chetana_host",
            "external_ai_provider": False,
            "language_mode": "multilingual_auto_detect",
            "max_duration_seconds": self.config.max_duration_seconds,
            "max_bytes": self.config.max_bytes,
            "retention": "raw_audio_deleted_after_transcription",
            "checks": checks,
        }

    async def _run_process(
        self,
        args: Sequence[str],
        *,
        timeout_seconds: float,
        failure_code: str,
        failure_detail: str,
        failure_status: int,
    ) -> tuple[bytes, bytes]:
        try:
            process = await asyncio.create_subprocess_exec(
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
        except (FileNotFoundError, PermissionError, OSError) as exc:
            logger.warning("Voice runtime could not start %s: %s", failure_code, type(exc).__name__)
            raise VoiceRuntimeError(
                "voice_runtime_unavailable",
                "Local voice transcription is temporarily unavailable.",
                503,
            ) from exc

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout_seconds,
            )
        except TimeoutError as exc:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                process.kill()
            await process.wait()
            logger.warning("Voice runtime timed out: %s", failure_code)
            raise VoiceRuntimeError(
                f"{failure_code}_timeout",
                "Voice processing took too long. Try a shorter, clearer recording.",
                503,
            ) from exc

        if process.returncode != 0:
            logger.warning("Voice runtime failed: %s rc=%s", failure_code, process.returncode)
            raise VoiceRuntimeError(failure_code, failure_detail, failure_status)
        return stdout, stderr

    async def _probe_duration(self, source_path: Path, *, allow_unknown: bool = False) -> float | None:
        stdout, _ = await self._run_process(
            [
                self.config.ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                str(source_path),
            ],
            timeout_seconds=self.config.probe_timeout_seconds,
            failure_code="voice_audio_invalid",
            failure_detail="Chetana could not read that audio file.",
            failure_status=422,
        )
        try:
            payload = json.loads(stdout.decode("utf-8"))
            duration = float(payload["format"]["duration"])
        except (UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            if allow_unknown:
                return None
            raise VoiceRuntimeError(
                "voice_duration_unknown",
                "Chetana could not determine the voice-note duration.",
                422,
            ) from exc
        if duration <= 0:
            raise VoiceRuntimeError("voice_audio_empty", "The voice note is empty.", 400)
        if duration > self.config.max_duration_seconds + 0.75:
            raise VoiceRuntimeError(
                "voice_too_long",
                f"Keep the voice note under {int(self.config.max_duration_seconds)} seconds.",
                413,
            )
        return duration

    async def _decode_audio(self, source_path: Path, wav_path: Path) -> None:
        await self._run_process(
            [
                self.config.ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-nostdin",
                "-y",
                "-i",
                str(source_path),
                "-t",
                str(self.config.max_duration_seconds + 1.0),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(wav_path),
            ],
            timeout_seconds=self.config.decode_timeout_seconds,
            failure_code="voice_decode_failed",
            failure_detail="Chetana could not decode that audio file.",
            failure_status=422,
        )

    async def _transcribe_wav(self, wav_path: Path, output_prefix: Path) -> tuple[str, str]:
        await self._run_process(
            [
                self.config.whisper_cli,
                "-m",
                str(self.config.model_path.expanduser()),
                "-f",
                str(wav_path),
                "-l",
                "auto",
                "-oj",
                "-of",
                str(output_prefix),
                "-np",
                "-nt",
            ],
            timeout_seconds=self.config.transcription_timeout_seconds,
            failure_code="voice_transcription_failed",
            failure_detail="Local voice transcription did not finish.",
            failure_status=503,
        )

        output_path = output_prefix.with_suffix(".json")
        try:
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            segments = payload.get("transcription") or []
            transcript = " ".join(
                str(segment.get("text") or "").strip()
                for segment in segments
                if isinstance(segment, dict)
            )
            transcript = " ".join(transcript.split())[:8000]
            language_code = str((payload.get("result") or {}).get("language") or "und")[:16]
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, AttributeError) as exc:
            raise VoiceRuntimeError(
                "voice_result_invalid",
                "Local voice transcription returned an unreadable result.",
                503,
            ) from exc
        if not transcript:
            raise VoiceRuntimeError(
                "voice_no_speech",
                "No clear speech was found. Try again closer to the microphone.",
                422,
            )
        return transcript, language_code

    async def _transcribe_locked(self, content: bytes, content_type: str) -> VoiceTranscription:
        started = time.perf_counter()
        suffix = _AUDIO_SUFFIXES[content_type]
        with tempfile.TemporaryDirectory(prefix="chetana-voice-") as temp_dir:
            temp_path = Path(temp_dir)
            source_path = temp_path / f"upload{suffix}"
            wav_path = temp_path / "decoded.wav"
            output_prefix = temp_path / "transcript"
            source_path.write_bytes(content)
            duration = await self._probe_duration(source_path, allow_unknown=True)
            await self._decode_audio(source_path, wav_path)
            if duration is None:
                duration = await self._probe_duration(wav_path)
            if duration is None:  # pragma: no cover - strict probe above cannot return None
                raise VoiceRuntimeError(
                    "voice_duration_unknown",
                    "Chetana could not determine the voice-note duration.",
                    422,
                )
            transcript, language_code = await self._transcribe_wav(wav_path, output_prefix)

        return VoiceTranscription(
            transcription_id=f"vtx_{uuid4().hex[:20]}",
            transcript=transcript,
            language_code=language_code,
            duration_seconds=round(duration, 2),
            processing_ms=max(1, round((time.perf_counter() - started) * 1000)),
        )

    async def transcribe(self, content: bytes, content_type: str | None) -> VoiceTranscription:
        normalized_type = (content_type or "").split(";", 1)[0].strip().lower()
        if normalized_type not in SUPPORTED_AUDIO_TYPES:
            raise VoiceRuntimeError(
                "voice_type_unsupported",
                "Use a short voice note in a standard audio format.",
                415,
            )
        if not content:
            raise VoiceRuntimeError("voice_audio_empty", "The voice note is empty.", 400)
        if len(content) > self.config.max_bytes:
            raise VoiceRuntimeError(
                "voice_file_too_large",
                f"Keep the voice note under {self.config.max_bytes // (1024 * 1024)} MB.",
                413,
            )
        if not self.status()["available"]:
            raise VoiceRuntimeError(
                "voice_runtime_unavailable",
                "Local voice transcription is temporarily unavailable.",
                503,
            )

        try:
            await asyncio.wait_for(
                self._semaphore.acquire(),
                timeout=self.config.queue_timeout_seconds,
            )
        except TimeoutError as exc:
            raise VoiceRuntimeError(
                "voice_runtime_busy",
                "Voice check is busy. Wait a moment and try again.",
                503,
            ) from exc
        try:
            return await self._transcribe_locked(content, normalized_type)
        finally:
            self._semaphore.release()


voice_runtime = LocalVoiceRuntime()


def voice_runtime_status() -> dict[str, Any]:
    return voice_runtime.status()


async def transcribe_voice(content: bytes, content_type: str | None) -> VoiceTranscription:
    return await voice_runtime.transcribe(content, content_type)
