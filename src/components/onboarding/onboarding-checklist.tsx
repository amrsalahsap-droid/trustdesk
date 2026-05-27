"use client";

import { WorkspaceSetupRail } from "./workspace-setup-rail";

/** Prefer importing `WorkspaceSetupRail` with an explicit `context`. */
export function OnboardingChecklist() {
  return <WorkspaceSetupRail context="dashboard" />;
}
