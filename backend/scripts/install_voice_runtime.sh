#!/usr/bin/env bash
set -euo pipefail

MODEL_NAME="ggml-large-v3-turbo-q5_0.bin"
MODEL_SHA256="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"
MODEL_DIR="${CHETANA_VOICE_MODEL_DIR:-${HOME}/Library/Application Support/Chetana/models}"
MODEL_PATH="${MODEL_DIR}/${MODEL_NAME}"
PARTIAL_PATH="${MODEL_PATH}.partial"

if ! command -v brew >/dev/null 2>&1; then
  printf 'Homebrew is required to install the local Chetana voice runtime.\n' >&2
  exit 1
fi

if ! command -v whisper-cli >/dev/null 2>&1; then
  brew install whisper-cpp
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  brew install ffmpeg
fi

mkdir -p "${MODEL_DIR}"

if [[ -f "${MODEL_PATH}" ]] && [[ "$(shasum -a 256 "${MODEL_PATH}" | awk '{print $1}')" == "${MODEL_SHA256}" ]]; then
  printf 'Chetana voice model is already installed and verified: %s\n' "${MODEL_PATH}"
  exit 0
fi

curl -fL --retry 3 --progress-bar -o "${PARTIAL_PATH}" "${MODEL_URL}"

if [[ "$(shasum -a 256 "${PARTIAL_PATH}" | awk '{print $1}')" != "${MODEL_SHA256}" ]]; then
  rm -f "${PARTIAL_PATH}"
  printf 'Voice model checksum verification failed.\n' >&2
  exit 1
fi

mv "${PARTIAL_PATH}" "${MODEL_PATH}"
printf 'Installed Chetana local voice runtime model: %s\n' "${MODEL_PATH}"
