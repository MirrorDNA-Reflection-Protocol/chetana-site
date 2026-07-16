import { describe, expect, it } from "vitest";

import { selectPreferredOcrResult, TESSERACT_LOCAL_ASSETS, unreadableScreenshotResult } from "./localScanner";

describe("localScreenshotScan", () => {
  it("keeps OCR worker, core, and language data on the Chetana origin", () => {
    expect(Object.values(TESSERACT_LOCAL_ASSETS).every((path) => path.startsWith("/ocr/"))).toBe(true);
  });

  it("returns low signal rather than low risk when OCR cannot read the image", async () => {
    const result = unreadableScreenshotResult();

    expect(result.verdict).toBe("LOW_SIGNAL");
    expect(result.needsDeepScan).toBe(true);
    expect(result.extractedText).toBe("");
  });
});

describe("selectPreferredOcrResult", () => {
  const baseline = {
    text: "Your KYC needs attention",
    confidence: 0.72,
    engine: "tesseract" as const,
    latencyMs: 300,
  };

  it("keeps the baseline when the challenger improvement is marginal", () => {
    const selected = selectPreferredOcrResult(baseline, {
      text: "Your KYC needs attention",
      confidence: 0.76,
      engine: "paddleocr",
      latencyMs: 180,
    });

    expect(selected.engine).toBe("tesseract");
    expect(selected.challenger?.selected).toBe(false);
  });

  it("uses the challenger when it recovers otherwise unreadable text", () => {
    const selected = selectPreferredOcrResult(
      { ...baseline, text: "", confidence: 0.1 },
      {
        text: "अपना OTP अभी बताइए",
        confidence: 0.86,
        engine: "paddleocr",
        latencyMs: 220,
      },
    );

    expect(selected.engine).toBe("paddleocr");
    expect(selected.challenger?.selected).toBe(true);
  });
});
