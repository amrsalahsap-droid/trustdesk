import { describe, it, expect } from "vitest";
import { computeAnswerSeedingJobTerminalStatus } from "../answer-seeding-job-service";

describe("computeAnswerSeedingJobTerminalStatus (D10-EN-05)", () => {
  it("returns COMPLETED when there are no topic runs", () => {
    expect(computeAnswerSeedingJobTerminalStatus([])).toBe("COMPLETED");
  });

  it("returns COMPLETED when no failures", () => {
    expect(
      computeAnswerSeedingJobTerminalStatus(["SUCCEEDED", "SKIPPED_EXISTS", "SKIPPED_NO_EVIDENCE"]),
    ).toBe("COMPLETED");
  });

  it("returns FAILED when only failures", () => {
    expect(computeAnswerSeedingJobTerminalStatus(["FAILED", "FAILED"])).toBe("FAILED");
  });

  it("returns PARTIAL when failures mix with successes or skips", () => {
    expect(computeAnswerSeedingJobTerminalStatus(["FAILED", "SUCCEEDED"])).toBe("PARTIAL");
    expect(computeAnswerSeedingJobTerminalStatus(["FAILED", "SKIPPED_EXISTS"])).toBe("PARTIAL");
    expect(computeAnswerSeedingJobTerminalStatus(["FAILED", "SKIPPED_NO_EVIDENCE"])).toBe("PARTIAL");
  });
});
