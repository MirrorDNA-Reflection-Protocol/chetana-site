# Chetana OCR and Domain Intelligence Runtime

Date: 2026-07-10

## Browser OCR ladder

1. Tesseract `eng+hin` remains the default browser extractor.
2. PaddleOCR.js 0.4.2 is an off-by-default challenger. It runs in-browser and is selected only when it recovers usable text or beats the baseline confidence by at least 0.08.
3. The challenger requires self-hosted ONNX model archives whose `inference.yml` model names match the configured names. The current official Devanagari PP-OCRv5 artifact is Paddle format, so it is not promoted until a reproducible conversion and Android benchmark pass.
4. Mistral OCR remains an explicit, consented fallback for weak screenshots. Its block labels, confidence, and bounding-box counts are recorded as extraction proof; it never owns the fraud verdict.

Build-time Paddle challenger variables:

```bash
VITE_CHETANA_PADDLE_OCR=1
VITE_CHETANA_PADDLE_DET_MODEL_NAME=PP-OCRv5_mobile_det
VITE_CHETANA_PADDLE_DET_MODEL_URL=/models/paddleocr/PP-OCRv5_mobile_det_onnx_infer.tar
VITE_CHETANA_PADDLE_REC_MODEL_NAME=devanagari_PP-OCRv5_mobile_rec
VITE_CHETANA_PADDLE_REC_MODEL_URL=/models/paddleocr/devanagari_PP-OCRv5_mobile_rec_onnx_infer.tar
VITE_CHETANA_PADDLE_WASM_PATHS=/models/paddleocr/ort/
```

Do not enable the challenger with the default Chinese recognition archive and describe it as Indic OCR.

## RDAP

`POST /api/v0/intelligence/domain` requires `domain-intelligence-consent`. It removes URL paths, queries, and fragments, resolves the TLD through IANA's bootstrap registry, and sends only the normalized hostname to the designated RDAP service.

RDAP age, registrar, and status are supporting evidence. Every response carries `no_match_is_safe: false`.

## Evaluation

Run the deterministic privacy-safe suite from `backend/`:

```bash
.venv/bin/python scripts/chetana_eval_harness.py --output /tmp/chetana-eval-report.json
```

The receipt contains input hashes, not raw messages. Release-gate cases and experimental language probes are counted separately. External datasets require declared license, provenance, and label semantics before import.
