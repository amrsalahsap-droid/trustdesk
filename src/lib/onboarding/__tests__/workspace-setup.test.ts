import { describe, it, expect } from "vitest";
import { deriveOnboardingSteps, type OnboardingStatus } from "../workspace-setup";

function s(partial: Partial<OnboardingStatus>): OnboardingStatus {
  return {
    workspaceCreated: false,
    documentsUploaded: false,
    analysisCompleted: false,
    libraryReady: false,
    ...partial,
  };
}

describe("deriveOnboardingSteps", () => {
  it("hides workspace step when ready and hideWorkspaceWhenReady is default true", () => {
    const r = deriveOnboardingSteps(
      s({ workspaceCreated: true, documentsUploaded: false, analysisCompleted: false, libraryReady: false }),
    );
    expect(r.steps.map((x) => x.id)).toEqual(["upload", "analysis", "library"]);
    expect(r.visibleCount).toBe(3);
    expect(r.currentStepNumber).toBe(1);
    expect(r.nextAction?.id).toBe("upload");
    expect(r.steps[0].current).toBe(true);
    expect(r.steps[1].blocked).toBe(true);
    expect(r.steps[2].blocked).toBe(true);
  });

  it("shows workspace when not hidden", () => {
    const r = deriveOnboardingSteps(
      s({ workspaceCreated: true, documentsUploaded: false }),
      { hideWorkspaceWhenReady: false },
    );
    expect(r.steps.map((x) => x.id)).toEqual(["workspace", "upload", "analysis", "library"]);
    expect(r.steps.find((x) => x.id === "upload")?.blocked).toBe(false);
    expect(r.steps.find((x) => x.id === "workspace")?.done).toBe(true);
  });

  it("marks current as analysis when uploads done but parsing not", () => {
    const r = deriveOnboardingSteps(
      s({
        workspaceCreated: true,
        documentsUploaded: true,
        analysisCompleted: false,
        libraryReady: false,
      }),
    );
    expect(r.nextAction?.id).toBe("analysis");
    expect(r.steps.find((x) => x.id === "analysis")?.current).toBe(true);
    expect(r.completedCount).toBe(1);
  });

  it("returns allComplete when every visible step is done", () => {
    const r = deriveOnboardingSteps(
      s({
        workspaceCreated: true,
        documentsUploaded: true,
        analysisCompleted: true,
        libraryReady: true,
      }),
    );
    expect(r.allComplete).toBe(true);
    expect(r.nextAction).toBeNull();
    expect(r.currentStepNumber).toBeNull();
    expect(r.progressPercent).toBe(100);
  });

  it("workspace incomplete shows workspace as current when not hidden", () => {
    const r = deriveOnboardingSteps(
      s({
        workspaceCreated: false,
        documentsUploaded: false,
        analysisCompleted: false,
        libraryReady: false,
      }),
      { hideWorkspaceWhenReady: false },
    );
    expect(r.nextAction?.id).toBe("workspace");
    expect(r.steps[0].current).toBe(true);
  });
});
