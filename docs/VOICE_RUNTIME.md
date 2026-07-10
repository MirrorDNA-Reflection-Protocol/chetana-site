# Chetana Voice Runtime

Date: 2026-07-10

## Active contract

- Browser records a voice note only after a microphone gesture.
- Recording stops at 30 seconds.
- `POST /api/v0/voice/transcribe` requires `local-voice-consent`.
- The Chetana host validates type, size, duration, and upload trust before decoding.
- `ffmpeg` converts the note to 16 kHz mono PCM inside a private temporary directory.
- A loopback-only `whisper-server` keeps `whisper-large-v3-turbo-q5_0` resident, uses Silero VAD 6.2, and runs automatic language detection.
- If that resident process is unavailable, the same model runs through the existing bounded `whisper-cli` path with VAD when its verified model is present.
- One transcription runs at a time, with queue and process deadlines.
- Raw audio and temporary transcript files are deleted before the API responds.
- The returned transcript enters the canonical four-state Chetana scan. Transcription failure never becomes a low-risk verdict.

Install or repair the runtime with:

```bash
backend/scripts/install_voice_runtime.sh
```

The public status and transcription receipts expose `runtime_mode` and `vad_enabled`; they never imply that a failed transcription was safe.

## Previous host smoke

Before the resident server was added, the active host transcribed a 7.45-second Indian-English synthetic scam sample in 0.79 seconds and a Hindi synthetic sample in 0.73 seconds with a warm Metal cache. A cold end-to-end CLI call took 7.65 seconds; the immediately repeated call took 0.81 seconds. Both retained the key entities `KYC`, `OTP`, and `UPI`. These are smoke results, not a population accuracy claim.

## India speech ladder

1. **Active:** local `whisper.cpp` large-v3-turbo q5 for short public checks.
2. **Deployable mirror:** the M4 mini has an MLX `whisper-large-v3-turbo` artifact and CLI. A bounded Hindi smoke completed in 5.83 seconds, but the old CLI also exited `0` after a missing-`ffmpeg` failure until PATH was repaired. No reviewed speech service is wired to Chetana, so this stays out of the public fallback path.
3. **Evaluation candidate:** AI4Bharat `indic-conformer-600m-multilingual`, an MIT-licensed ONNX model for all 22 scheduled Indian languages. Its gated model download and heavier runtime need a separate benchmark before promotion.
4. **Consented hosted candidate:** Sarvam Saaras v3 supports 22 Indian languages plus English and India-focused code mixing. It is an external paid API and no Chetana key is configured, so it is not in the default path.
5. **Unavailable candidate:** Sarvam Edge announced a compact 10-language on-device ASR model, but no local artifact or public install contract was found on either active Mac.
6. **Research candidate:** Meta Omnilingual ASR adds very broad language coverage, but its smallest production ASR path is materially heavier than the current 547 MiB q5 runtime.

Sarvam Translate is already present on the MacBook and mini for 22-language text translation. It is not a speech-recognition model and must remain a separate post-transcription language rail.

## Primary references

- whisper.cpp model inventory and checksums: https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md
- Sarvam model coverage: https://docs.sarvam.ai/api-reference-docs/getting-started/models
- Sarvam Edge speech specifications: https://www.sarvam.ai/blogs/sarvam-edge
- AI4Bharat IndicConformer: https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual
- Meta Omnilingual ASR: https://github.com/facebookresearch/omnilingual-asr
