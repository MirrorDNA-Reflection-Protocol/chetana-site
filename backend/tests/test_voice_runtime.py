from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.voice_runtime import (
    VOICE_CONSENT_TOKEN,
    LocalVoiceRuntime,
    VoiceRuntimeConfig,
    VoiceRuntimeError,
    VoiceServerUnavailable,
    VoiceTranscriptResult,
    VoiceTranscription,
)


class StubVoiceRuntime(LocalVoiceRuntime):
    def __init__(self, config: VoiceRuntimeConfig) -> None:
        super().__init__(config)
        self.temp_dir: Path | None = None

    async def _probe_duration(self, source_path: Path, *, allow_unknown: bool = False) -> float | None:
        self.temp_dir = source_path.parent
        return 4.25

    async def _decode_audio(self, source_path: Path, wav_path: Path) -> None:
        assert source_path != wav_path
        wav_path.write_bytes(source_path.read_bytes())

    async def _transcribe_wav(self, wav_path: Path, output_prefix: Path) -> VoiceTranscriptResult:
        assert wav_path.exists()
        return VoiceTranscriptResult(
            transcript="Share the OTP and approve the UPI collect request now.",
            language_code="en",
            runtime_mode="cli_fallback",
            vad_enabled=False,
        )


def runtime_config(tmp_path: Path, **overrides) -> VoiceRuntimeConfig:
    model_path = tmp_path / "model.bin"
    model_path.write_bytes(b"model")
    values = {
        "whisper_cli": sys.executable,
        "ffmpeg": sys.executable,
        "ffprobe": sys.executable,
        "model_path": model_path,
        "prefer_server": False,
        "max_bytes": 64,
        "max_duration_seconds": 30.0,
        "queue_timeout_seconds": 0.02,
        "probe_timeout_seconds": 0.1,
        "decode_timeout_seconds": 0.1,
        "transcription_timeout_seconds": 0.1,
        "max_concurrency": 1,
    }
    values.update(overrides)
    return VoiceRuntimeConfig(**values)


def test_local_voice_runtime_returns_receipt_and_removes_temp_files(tmp_path: Path) -> None:
    runtime = StubVoiceRuntime(runtime_config(tmp_path))

    result = asyncio.run(runtime.transcribe(b"voice-bytes", "audio/webm;codecs=opus"))

    assert result.transcript.startswith("Share the OTP")
    assert result.language_code == "en"
    assert result.duration_seconds == 4.25
    assert result.to_dict()["runtime"]["external_ai_provider"] is False
    assert result.to_dict()["runtime"]["mode"] == "cli_fallback"
    assert result.to_dict()["privacy"] == {
        "audio_retained": False,
        "transcript_persisted_by_transcriber": False,
        "temporary_files_deleted": True,
    }
    assert runtime.temp_dir is not None
    assert not runtime.temp_dir.exists()


def test_streaming_webm_without_container_duration_uses_decoded_wav(tmp_path: Path) -> None:
    class StreamingWebmRuntime(StubVoiceRuntime):
        def __init__(self, config: VoiceRuntimeConfig) -> None:
            super().__init__(config)
            self.probes: list[str] = []

        async def _probe_duration(self, source_path: Path, *, allow_unknown: bool = False) -> float | None:
            self.probes.append(source_path.name)
            if allow_unknown:
                return None
            return 6.5

    runtime = StreamingWebmRuntime(runtime_config(tmp_path))

    result = asyncio.run(runtime.transcribe(b"streaming-webm", "audio/webm"))

    assert result.duration_seconds == 6.5
    assert runtime.probes == ["upload.webm", "decoded.wav"]


def test_local_voice_runtime_rejects_audio_over_duration_limit(tmp_path: Path) -> None:
    runtime = LocalVoiceRuntime(runtime_config(tmp_path))

    with patch.object(
        runtime,
        "_run_process",
        new=AsyncMock(return_value=(b'{"format":{"duration":"31.1"}}', b"")),
    ):
        try:
            asyncio.run(runtime._probe_duration(tmp_path / "voice.webm"))
            raise AssertionError("voice note over 30 seconds should fail")
        except VoiceRuntimeError as exc:
            assert exc.code == "voice_too_long"
            assert exc.status_code == 413


def test_resident_server_payload_preserves_language_code_and_mode(tmp_path: Path) -> None:
    runtime = LocalVoiceRuntime(runtime_config(tmp_path))
    transcript, language_code = runtime._parse_server_transcription(
        {
            "text": " Share the OTP now. ",
            "language_probabilities": {"hi": 0.91, "en": 0.09},
        }
    )

    assert transcript == "Share the OTP now."
    assert language_code == "hi"


def test_resident_server_failure_falls_back_to_bounded_cli(tmp_path: Path) -> None:
    runtime = LocalVoiceRuntime(runtime_config(tmp_path, prefer_server=True))
    cli_result = VoiceTranscriptResult(
        transcript="Fallback transcript",
        language_code="en",
        runtime_mode="cli_fallback",
        vad_enabled=True,
    )

    with (
        patch.object(runtime, "_resident_server_available", return_value=True),
        patch.object(
            runtime,
            "_transcribe_with_server",
            new=AsyncMock(side_effect=VoiceServerUnavailable("server_down")),
        ),
        patch.object(runtime, "_transcribe_with_cli", new=AsyncMock(return_value=cli_result)) as cli,
    ):
        result = asyncio.run(runtime._transcribe_wav(tmp_path / "decoded.wav", tmp_path / "out"))

    assert result.runtime_mode == "cli_fallback"
    cli.assert_awaited_once()


def test_cli_enables_vad_when_verified_model_is_present(tmp_path: Path) -> None:
    vad_path = tmp_path / "vad.bin"
    vad_path.write_bytes(b"vad")
    runtime = LocalVoiceRuntime(runtime_config(tmp_path, vad_model_path=vad_path))
    output_prefix = tmp_path / "transcript"
    output_prefix.with_suffix(".json").write_text(
        '{"result":{"language":"en"},"transcription":[{"text":"hello"}]}',
        encoding="utf-8",
    )

    with patch.object(runtime, "_run_process", new=AsyncMock(return_value=(b"", b""))) as process:
        result = asyncio.run(runtime._transcribe_with_cli(tmp_path / "decoded.wav", output_prefix))

    args = process.await_args.args[0]
    assert "--vad" in args
    assert str(vad_path) in args
    assert result.vad_enabled is True


def test_local_voice_runtime_rejects_unsupported_and_oversized_audio(tmp_path: Path) -> None:
    runtime = StubVoiceRuntime(runtime_config(tmp_path, max_bytes=8))

    try:
        asyncio.run(runtime.transcribe(b"voice", "application/octet-stream"))
        raise AssertionError("unsupported type should fail")
    except VoiceRuntimeError as exc:
        assert exc.code == "voice_type_unsupported"
        assert exc.status_code == 415

    try:
        asyncio.run(runtime.transcribe(b"123456789", "audio/webm"))
        raise AssertionError("oversized voice note should fail")
    except VoiceRuntimeError as exc:
        assert exc.code == "voice_file_too_large"
        assert exc.status_code == 413


def test_local_voice_runtime_fails_fast_when_busy(tmp_path: Path) -> None:
    class BlockingVoiceRuntime(StubVoiceRuntime):
        async def _transcribe_locked(self, content: bytes, content_type: str) -> VoiceTranscription:
            await asyncio.sleep(0.1)
            return VoiceTranscription(
                transcription_id="vtx_test",
                transcript="test",
                language_code="en",
                duration_seconds=1.0,
                processing_ms=100,
            )

    async def exercise() -> None:
        runtime = BlockingVoiceRuntime(runtime_config(tmp_path, queue_timeout_seconds=0.01))
        first = asyncio.create_task(runtime.transcribe(b"voice", "audio/webm"))
        await asyncio.sleep(0.005)
        try:
            await runtime.transcribe(b"voice", "audio/webm")
            raise AssertionError("second transcription should fail while busy")
        except VoiceRuntimeError as exc:
            assert exc.code == "voice_runtime_busy"
            assert exc.status_code == 503
        await first

    asyncio.run(exercise())


def test_voice_status_exposes_local_only_contract() -> None:
    client = TestClient(app)

    response = client.get("/api/v0/voice/status")

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "whisper.cpp"
    assert data["external_ai_provider"] is False
    assert data["max_duration_seconds"] == 30.0
    assert data["retention"] == "raw_audio_deleted_after_transcription"


def test_voice_transcription_requires_explicit_consent() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v0/voice/transcribe",
        data={"consent_token": "nope"},
        files={"file": ("voice.webm", b"voice", "audio/webm")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "local_voice_consent_required"


def test_voice_transcription_endpoint_returns_local_receipt() -> None:
    client = TestClient(app)
    transcription = VoiceTranscription(
        transcription_id="vtx_endpoint",
        transcript="Share the OTP now.",
        language_code="en",
        duration_seconds=2.5,
        processing_ms=180,
    )

    with (
        patch("app.main._gate_upload", return_value=None),
        patch("app.main.transcribe_voice", new=AsyncMock(return_value=transcription)),
    ):
        response = client.post(
            "/api/v0/voice/transcribe",
            data={"consent_token": VOICE_CONSENT_TOKEN},
            files={"file": ("voice.webm", b"voice", "audio/webm")},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["transcript"] == "Share the OTP now."
    assert data["runtime"]["external_ai_provider"] is False
    assert data["privacy"]["audio_retained"] is False


def test_voice_runtime_failure_stays_explicit_not_low_risk() -> None:
    client = TestClient(app)
    failure = VoiceRuntimeError(
        "voice_no_speech",
        "No clear speech was found. Try again closer to the microphone.",
        422,
    )

    with (
        patch("app.main._gate_upload", return_value=None),
        patch("app.main.transcribe_voice", new=AsyncMock(side_effect=failure)),
    ):
        response = client.post(
            "/api/v0/voice/transcribe",
            data={"consent_token": VOICE_CONSENT_TOKEN},
            files={"file": ("voice.webm", b"voice", "audio/webm")},
        )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "voice_no_speech"
    assert "low" not in response.text.lower()


def test_legacy_voice_endpoint_uses_canonical_verdict_without_low_risk_fallback() -> None:
    client = TestClient(app)
    transcription = VoiceTranscription(
        transcription_id="vtx_legacy",
        transcript="Your bank KYC is blocked. Share the OTP and send money now.",
        language_code="en",
        duration_seconds=4.0,
        processing_ms=200,
    )

    with (
        patch("app.main._gate_upload", return_value=None),
        patch("app.main.transcribe_voice", new=AsyncMock(return_value=transcription)),
        patch("app.main.enrich_v0_verdict", new=AsyncMock(side_effect=lambda verdict: verdict)),
    ):
        response = client.post(
            "/api/voice/analyze",
            data={"consent_token": VOICE_CONSENT_TOKEN, "lang": "en"},
            files={"file": ("voice.webm", b"voice", "audio/webm")},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["verdict"] == "SUSPICIOUS"
    assert data["chetana"]["verdict"] == "high_risk"
    assert data["voice_runtime"]["privacy"]["audio_retained"] is False
