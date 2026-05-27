import { describe, it, expect } from "vitest";
import { shouldShowOnboardingMarketingRail, type OnboardingStep } from "../onboarding-layout-helpers";

describe("shouldShowOnboardingMarketingRail", () => {
  it("should show rail for initial creation steps", () => {
    expect(shouldShowOnboardingMarketingRail("DETAILS")).toBe(true);
    expect(shouldShowOnboardingMarketingRail("DOMAIN_INPUT")).toBe(true);
  });

  it("should show rail during analysis loading state", () => {
    expect(shouldShowOnboardingMarketingRail("ANALYZING")).toBe(true);
  });

  it("should hide rail for results and review steps", () => {
    expect(shouldShowOnboardingMarketingRail("REVIEW")).toBe(false);
    expect(shouldShowOnboardingMarketingRail("PROFILE")).toBe(false);
  });

  it("should hide rail for workspace preparation (recommendations) step", () => {
    expect(shouldShowOnboardingMarketingRail("RECOMMENDATIONS")).toBe(false);
  });

  it("should handle all defined steps correctly", () => {
    const steps: OnboardingStep[] = ["DETAILS", "DOMAIN_INPUT", "ANALYZING", "REVIEW", "PROFILE", "RECOMMENDATIONS"];
    
    steps.forEach(step => {
      const result = shouldShowOnboardingMarketingRail(step);
      if (["DETAILS", "DOMAIN_INPUT", "ANALYZING"].includes(step)) {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    });
  });
});
