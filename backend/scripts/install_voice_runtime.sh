#!/usr/bin/env bash
set -euo pipefail

MODEL_NAME="ggml-large-v3-turbo-q5_0.bin"
MODEL_SHA256="394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}"
VAD_MODEL_NAME="ggml-silero-v6.2.0.bin"
VAD_MODEL_SHA256="2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987"
VAD_MODEL_URL="https://huggingface.co/ggml-org/whisper-vad/resolve/main/${VAD_MODEL_NAME}"
MODEL_DIR="${CHETANA_VOICE_MODEL_DIR:-${HOME}/Library/Application Support/Chetana/models}"

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

install_verified_artifact() {
  local name="$1"
  local expected_sha="$2"
  local url="$3"
  local target="${MODEL_DIR}/${name}"
  local partial="${target}.partial"

  if [[ -f "${target}" ]] && [[ "$(shasum -a 256 "${target}" | awk '{print $1}')" == "${expected_sha}" ]]; then
    printf 'Chetana voice artifact is already installed and verified: %s\n' "${target}"
    return
  fi

  curl -fL --retry 3 --progress-bar -o "${partial}" "${url}"

  if [[ "$(shasum -a 256 "${partial}" | awk '{print $1}')" != "${expected_sha}" ]]; then
    rm -f "${partial}"
    printf 'Voice artifact checksum verification failed: %s\n' "${name}" >&2
    exit 1
  fi

  mv "${partial}" "${target}"
  printf 'Installed Chetana local voice artifact: %s\n' "${target}"
}

install_verified_artifact "${MODEL_NAME}" "${MODEL_SHA256}" "${MODEL_URL}"
install_verified_artifact "${VAD_MODEL_NAME}" "${VAD_MODEL_SHA256}" "${VAD_MODEL_URL}"
