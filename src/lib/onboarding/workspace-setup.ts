export type OnboardingStatus = {
  workspaceCreated: boolean;
  documentsUploaded: boolean;
  analysisCompleted: boolean;
  libraryReady: boolean;
};

export type OnboardingStepId = "workspace" | "upload" | "analysis" | "library";

export type WorkspaceSetupContext = "dashboard" | "documents" | "library";

export type DerivedWorkspaceStep = {
  id: OnboardingStepId;
  done: boolean;
  blocked: boolean;
  current: boolean;
  pillLabel: string;
  headline: string;
  supportingLine: string;
  href: string;
  primaryCtaLabel: string;
};

type RawStep = Omit<DerivedWorkspaceStep, "blocked" | "current">;

const STEP_DEFS: Record<
  OnboardingStepId,
  Pick<RawStep, "pillLabel" | "headline" | "supportingLine" | "href" | "primaryCtaLabel">
> = {
  workspace: {
    pillLabel: "Workspace",
    headline: "Workspace ready",
    supportingLine: "You are signed in to an active workspace.",
    href: "/app",
    primaryCtaLabel: "Go to dashboard",
  },
  upload: {
    pillLabel: "Upload",
    headline: "Add source documents",
    supportingLine:
      "Upload PDF, DOCX, or plain text so questionnaire answers can cite real evidence.",
    href: "/app/documents",
    primaryCtaLabel: "Upload documents",
  },
  analysis: {
    pillLabel: "Indexing",
    headline: "Indexing in progress",
    supportingLine:
      "Files are being parsed in the background. Status updates on the Documents page.",
    href: "/app/documents",
    primaryCtaLabel: "View document status",
  },
  library: {
    pillLabel: "Library",
    headline: "Review your answer library",
    supportingLine:
      "Confirm seeded answers and evidence before teams rely on them in questionnaires.",
    href: "/app/library",
    primaryCtaLabel: "Open answer library",
  },
};

function rawStepsFromStatus(status: OnboardingStatus): RawStep[] {
  const order: OnboardingStepId[] = ["workspace", "upload", "analysis", "library"];
  return order.map((id) => ({
    id,
    done:
      id === "workspace"
        ? status.workspaceCreated
        : id === "upload"
          ? status.documentsUploaded
          : id === "analysis"
            ? status.analysisCompleted
            : status.libraryReady,
    ...STEP_DEFS[id],
  }));
}

export function deriveOnboardingSteps(
  status: OnboardingStatus,
  options?: { hideWorkspaceWhenReady?: boolean },
): {
  steps: DerivedWorkspaceStep[];
  visibleCount: number;
  completedCount: number;
  progressPercent: number;
  /** 1-based index in the visible step list, or null when all complete */
  currentStepNumber: number | null;
  nextAction: DerivedWorkspaceStep | null;
  allComplete: boolean;
} {
  const hideWorkspace = options?.hideWorkspaceWhenReady ?? true;
  let visible = rawStepsFromStatus(status);
  if (hideWorkspace && status.workspaceCreated) {
    visible = visible.filter((s) => s.id !== "workspace");
  }

  const completedCount = visible.filter((s) => s.done).length;
  const allComplete = completedCount === visible.length;
  const currentIdx = allComplete ? -1 : visible.findIndex((s) => !s.done);

  const steps: DerivedWorkspaceStep[] = visible.map((s, i) => ({
    ...s,
    blocked: !allComplete && currentIdx !== -1 && i > currentIdx,
    current: !allComplete && i === currentIdx,
  }));

  const nextAction = allComplete || currentIdx < 0 ? null : steps[currentIdx] ?? null;
  const progressPercent = visible.length === 0 ? 0 : (completedCount / visible.length) * 100;

  return {
    steps,
    visibleCount: visible.length,
    completedCount,
    progressPercent,
    currentStepNumber: allComplete ? null : currentIdx + 1,
    nextAction,
    allComplete,
  };
}

const CONTEXT_SUBLINE: Record<WorkspaceSetupContext, string> = {
  dashboard: "Complete the steps below to reach your first trustworthy questionnaire answers.",
  documents: "Use the upload controls on this page to add files to your workspace.",
  library: "Use this page to review topics and evidence-backed answers as they become ready.",
};

export function workspaceSetupContextSubline(context: WorkspaceSetupContext): string {
  return CONTEXT_SUBLINE[context];
}
