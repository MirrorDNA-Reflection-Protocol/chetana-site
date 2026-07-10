from app.mistral_ocr import _extract_ocr_text


def test_ocr4_blocks_contribute_confidence_and_proof_metadata() -> None:
    summary = _extract_ocr_text(
        {
            "pages": [
                {
                    "markdown": "Your KYC expires today. Share OTP now.",
                    "blocks": [
                        {
                            "type": "paragraph",
                            "text": "Your KYC expires today.",
                            "confidence": 0.92,
                            "bbox": [10, 20, 400, 80],
                        },
                        {
                            "type": "table",
                            "text": "Share OTP now.",
                            "confidence_score": 80,
                        },
                    ],
                }
            ]
        }
    )

    assert summary.text.startswith("Your KYC")
    assert summary.confidence == 0.86
    assert summary.page_count == 1
    assert summary.block_count == 2
    assert summary.block_types == ("paragraph", "table")
    assert summary.bounded_block_count == 1


def test_ocr4_block_text_is_used_when_page_markdown_is_missing() -> None:
    summary = _extract_ocr_text(
        {
            "pages": [
                {
                    "blocks": [
                        {"label": "paragraph", "content": "Approve the UPI request."},
                    ]
                }
            ]
        }
    )

    assert summary.text == "Approve the UPI request."
    assert summary.confidence is None
    assert summary.block_count == 1
