import { describe, it, expect } from "vitest";
import { checkReadability } from "../domain-crawler";

describe("checkReadability", () => {
  it("passes standard English text", () => {
    const text = "This is a standard English sentence with some punctuation and numbers 123.";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(true);
    expect(result.diagnostics.detectedScript).toBe("Latin");
    expect(result.diagnostics.printableRatio).toBeGreaterThan(0.9);
  });

  it("passes standard Arabic text", () => {
    const text = "هذا نص باللغة العربية مع بعض الأرقام 123 وعلامات الترقيم.";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(true);
    expect(result.diagnostics.detectedScript).toBe("Arabic");
    expect(result.diagnostics.letterOrNumberRatio).toBeGreaterThan(0.7);
  });

  it("passes standard Cyrillic text", () => {
    const text = "Это текст на русском языке с цифрами 123 и знаками препинания.";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(true);
    expect(result.diagnostics.detectedScript).toBe("Cyrillic");
  });

  it("passes mixed Arabic and English text", () => {
    const text = "Contact us at support@example.com or اتصل بنا على الرقم التالي.";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(true);
    expect(result.diagnostics.printableRatio).toBeGreaterThan(0.9);
  });

  it("fails binary-like content with many null bytes/control chars", () => {
    const text = "Readable text" + "\x00\x01\x02\x03\x04\x05\x06\x07\x08" + "more text";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(false);
    expect(result.reason).toContain("excessive control characters");
  });

  it("fails content with excessive replacement characters (mojibake)", () => {
    const text = "Some valid text \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD";
    // Ratio needs to be > 0.02 for the current logic to fail
    const largeText = "A".repeat(50) + "\uFFFD".repeat(10);
    const result = checkReadability(largeText);
    expect(result.isReadable).toBe(false);
    expect(result.reason).toContain("too many replacement characters");
  });

  it("fails very short garbage with low printable ratio", () => {
    const text = "\x01\x02\x03\x04\x05\x06\x07\x08\x09\x10";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(false);
  });

  it("fails long text with extremely low letter/number ratio (e.g. repetitive punctuation)", () => {
    const text = ".".repeat(1000);
    const result = checkReadability(text);
    expect(result.isReadable).toBe(false);
    expect(result.reason).toContain("low core content ratio");
  });
});
