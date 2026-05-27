import { describe, it, expect, vi } from "vitest";
import { checkReadability } from "../domain-crawler";

// Mock terminology check since it's internal to fetchPage in our current implementation plan
// but we can test the checkReadability logic and the shared helpers.

describe("Adaptive Thresholds & Signal Terms", () => {
  // Since SIGNAL_TERMS and hasSignalTerms are now in domain-crawler.ts (exported or internal)
  // I will test them via a verification script that uses the actual file.
  
  it("verify that checkReadability still works with the new diagnostics", () => {
    const text = "This is a standard English sentence.";
    const result = checkReadability(text);
    expect(result.isReadable).toBe(true);
    expect(result.diagnostics.printableRatio).toBeGreaterThan(0.9);
  });
});

// Since I cannot easily run Vitest with the current environment issues, 
// I will create another self-contained verification script for these new rules.
