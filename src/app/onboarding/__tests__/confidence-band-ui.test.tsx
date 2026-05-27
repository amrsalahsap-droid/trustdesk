import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { formatConfidenceDisplay, getConfidenceBandLabel, getConfidenceBandColor } from "../onboarding-workspace-form";

// Mock the signal types
interface MockSignal {
  confidence: number;
  confidenceBand?: string;
  conflict?: {
    rival: { confidence: number };
  };
}

describe("Confidence Band UI Display", () => {
  describe("formatConfidenceDisplay", () => {
    it("displays high confidence band when available", () => {
      const signal: MockSignal = {
        confidence: 0.85,
        confidenceBand: "high",
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("High confidence");
      expect(result.color).toBe("text-trust-green");
      expect(result.showPercentage).toBe(false);
    });

    it("displays medium confidence band when available", () => {
      const signal: MockSignal = {
        confidence: 0.65,
        confidenceBand: "medium",
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Medium confidence");
      expect(result.color).toBe("text-intelligence-blue");
      expect(result.showPercentage).toBe(false);
    });

    it("displays limited evidence band when available", () => {
      const signal: MockSignal = {
        confidence: 0.45,
        confidenceBand: "limited",
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Limited evidence");
      expect(result.color).toBe("text-warning-amber");
      expect(result.showPercentage).toBe(false);
    });

    it("displays needs your decision for unknown band", () => {
      const signal: MockSignal = {
        confidence: 0.25,
        confidenceBand: "unknown",
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Needs your decision");
      expect(result.color).toBe("text-error-red");
      expect(result.showPercentage).toBe(false);
    });

    it("falls back to percentage conversion when no band available", () => {
      const signal: MockSignal = {
        confidence: 0.85,
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("High confidence");
      expect(result.color).toBe("text-trust-green");
      expect(result.showPercentage).toBe(true);
    });

    it("falls back to medium from percentage", () => {
      const signal: MockSignal = {
        confidence: 0.65,
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Medium confidence");
      expect(result.color).toBe("text-intelligence-blue");
      expect(result.showPercentage).toBe(true);
    });

    it("falls back to limited from percentage", () => {
      const signal: MockSignal = {
        confidence: 0.45,
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Limited evidence");
      expect(result.color).toBe("text-warning-amber");
      expect(result.showPercentage).toBe(true);
    });

    it("falls back to needs your decision from low percentage", () => {
      const signal: MockSignal = {
        confidence: 0.25,
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Needs your decision");
      expect(result.color).toBe("text-error-red");
      expect(result.showPercentage).toBe(true);
    });
  });

  describe("getConfidenceBandLabel", () => {
    it("returns correct labels for all bands", () => {
      expect(getConfidenceBandLabel("high")).toBe("High confidence");
      expect(getConfidenceBandLabel("medium")).toBe("Medium confidence");
      expect(getConfidenceBandLabel("limited")).toBe("Limited evidence");
      expect(getConfidenceBandLabel("unknown")).toBe("Needs your decision");
      expect(getConfidenceBandLabel(null)).toBe("Needs your decision");
      expect(getConfidenceBandLabel(undefined)).toBe("Needs your decision");
    });
  });

  describe("getConfidenceBandColor", () => {
    it("returns correct colors for all bands", () => {
      expect(getConfidenceBandColor("high")).toBe("text-trust-green");
      expect(getConfidenceBandColor("medium")).toBe("text-intelligence-blue");
      expect(getConfidenceBandColor("limited")).toBe("text-warning-amber");
      expect(getConfidenceBandColor("unknown")).toBe("text-error-red");
      expect(getConfidenceBandColor(null)).toBe("text-error-red");
      expect(getConfidenceBandColor(undefined)).toBe("text-error-red");
    });
  });

  describe("UI Behavior Examples", () => {
    it("shows strong software company with high confidence", () => {
      const signal: MockSignal = {
        confidence: 0.35, // Low AI confidence
        confidenceBand: "high", // But strong evidence-based confidence
      };

      const result = formatConfidenceDisplay(signal);

      // User sees high confidence, not the misleading 35%
      expect(result.label).toBe("High confidence");
      expect(result.showPercentage).toBe(false);
    });

    it("shows conflicted field as needs your decision", () => {
      const signal: MockSignal = {
        confidence: 0.65,
        confidenceBand: "unknown", // Conflict overrides to unknown
        conflict: {
          rival: { confidence: 0.60 }
        }
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Needs your decision");
      expect(result.color).toBe("text-error-red");
    });

    it("shows SaaS serving healthcare with appropriate confidence", () => {
      const signal: MockSignal = {
        confidence: 0.42, // Low AI confidence
        confidenceBand: "medium", // Evidence-based medium confidence
      };

      const result = formatConfidenceDisplay(signal);

      expect(result.label).toBe("Medium confidence");
      expect(result.showPercentage).toBe(false);
    });
  });
});
