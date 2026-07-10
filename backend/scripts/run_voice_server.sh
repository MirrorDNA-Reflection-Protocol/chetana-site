#!/usr/bin/env bash
set -euo pipefail

MODEL_DIR="${CHETANA_VOICE_MODEL_DIR:-${HOME}/Library/Application Support/Chetana/models}"
MODEL_PATH="${CHETANA_VOICE_MODEL_PATH:-${MODEL_DIR}/ggml-large-v3-turbo-q5_0.bin}"
VAD_MODEL_PATH="${CHETANA_VAD_MODEL_PATH:-${MODEL_DIR}/ggml-silero-v6.2.0.bin}"
WHISPER_SERVER="${CHETANA_WHISPER_SERVER_BIN:-/opt/homebrew/bin/whisper-server}"
VOICE_PORT="${CHETANA_WHISPER_SERVER_PORT:-8109}"

for required in "${WHISPER_SERVER}" "${MODEL_PATH}" "${VAD_MODEL_PATH}"; do
  if [[ ! -f "${required}" ]]; then
    printf 'Missing Chetana voice runtime artifact: %s\n' "${required}" >&2
    exit 1
  fi
done

exec "${WHISPER_SERVER}" \
  --model "${MODEL_PATH}" \
  --host 127.0.0.1 \
  --port "${VOICE_PORT}" \
  --language auto \
  --vad \
  --vad-model "${VAD_MODEL_PATH}" \
  --no-timestamps \
  --suppress-nst
