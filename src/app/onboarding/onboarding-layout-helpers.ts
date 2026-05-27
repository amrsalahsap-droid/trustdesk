/**
 * Onboarding step definition matches the Step type in OnboardingWorkspaceForm
 */
export type OnboardingStep = "DETAILS" | "DOMAIN_INPUT" | "ANALYZING" | "REVIEW" | "PROFILE" | "RECOMMENDATIONS";

/**
 * Canonical helper to determine if the onboarding marketing rail (sidebar)
 * should be visible for the current step.
 */
export function shouldShowOnboardingMarketingRail(step: OnboardingStep): boolean {
  return ["DETAILS", "DOMAIN_INPUT", "ANALYZING"].includes(step);
}
