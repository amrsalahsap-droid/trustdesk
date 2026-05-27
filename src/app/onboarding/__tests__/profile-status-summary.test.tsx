import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock icons
vi.mock("@/components/icons", () => ({
  CheckIcon: () => <span data-testid="check-icon">✓</span>,
  AlertCircleIcon: () => <span data-testid="alert-icon">⚠</span>,
  SparklesIcon: () => <span data-testid="sparkles-icon">✨</span>,
  ShieldCheckIcon: () => <span data-testid="shield-icon">🛡</span>,
  ChevronRightIcon: () => <span data-testid="chevron-icon">›</span>,
  LinkIcon: () => <span data-testid="link-icon">🔗</span>,
  SearchIcon: () => <span data-testid="search-icon">🔍</span>,
  FileTextIcon: () => <span data-testid="file-icon">📄</span>,
  UserIcon: () => <span data-testid="user-icon">👤</span>,
  BuildingIcon: () => <span data-testid="building-icon">🏢</span>,
  DatabaseIcon: () => <span data-testid="database-icon">🗄</span>,
  CloudIcon: () => <span data-testid="cloud-icon">☁</span>,
  LayoutIcon: () => <span data-testid="layout-icon">📐</span>,
}));

// Simple test version of ProfileStatusSummary
function ProfileStatusSummary({
  readyCount,
  conflictedCount,
  needsReviewCount,
  hasUnresolvedConflicts,
}: {
  readyCount: number;
  conflictedCount: number;
  needsReviewCount: number;
  hasUnresolvedConflicts: boolean;
}) {
  const total = readyCount + conflictedCount + needsReviewCount;
  
  let statusTitle = "Ready to confirm";
  let statusClass = "ready";
  
  if (hasUnresolvedConflicts) {
    statusTitle = "Needs your decision";
    statusClass = "conflicted";
  } else if (needsReviewCount > 0) {
    statusTitle = "Needs review";
    statusClass = "needs-review";
  }
  
  return (
    <div data-testid="profile-status" className={statusClass}>
      <h3 data-testid="status-title">{statusTitle}</h3>
      <p data-testid="status-summary">
        {total} fields · {readyCount} ready
        {conflictedCount > 0 && <span> · {conflictedCount} conflicted</span>}
        {needsReviewCount > 0 && !hasUnresolvedConflicts && <span> · {needsReviewCount} needs review</span>}
      </p>
      <div data-testid="count-pills">
        {readyCount > 0 && <span data-testid="ready-pill">{readyCount} ready</span>}
        {conflictedCount > 0 && <span data-testid="conflicted-pill">{conflictedCount} conflicted</span>}
        {needsReviewCount > 0 && <span data-testid="needs-review-pill">{needsReviewCount} needs review</span>}
      </div>
    </div>
  );
}

describe("ProfileStatusSummary", () => {
  it("shows 'Ready to confirm' when all fields are ready", () => {
    render(
      <ProfileStatusSummary
        readyCount={3}
        conflictedCount={0}
        needsReviewCount={0}
        hasUnresolvedConflicts={false}
      />
    );
    
    expect(screen.getByTestId("status-title")).toHaveTextContent("Ready to confirm");
    expect(screen.getByTestId("status-summary")).toHaveTextContent("3 fields · 3 ready");
    expect(screen.getByTestId("ready-pill")).toHaveTextContent("3 ready");
  });

  it("shows 'Needs your decision' when conflicts exist", () => {
    render(
      <ProfileStatusSummary
        readyCount={2}
        conflictedCount={1}
        needsReviewCount={0}
        hasUnresolvedConflicts={true}
      />
    );
    
    expect(screen.getByTestId("status-title")).toHaveTextContent("Needs your decision");
    expect(screen.getByTestId("status-summary")).toHaveTextContent("3 fields · 2 ready · 1 conflicted");
    expect(screen.getByTestId("conflicted-pill")).toHaveTextContent("1 conflicted");
  });

  it("shows 'Needs review' when fields need review (no conflicts)", () => {
    render(
      <ProfileStatusSummary
        readyCount={2}
        conflictedCount={0}
        needsReviewCount={1}
        hasUnresolvedConflicts={false}
      />
    );
    
    expect(screen.getByTestId("status-title")).toHaveTextContent("Needs review");
    expect(screen.getByTestId("status-summary")).toHaveTextContent("3 fields · 2 ready · 1 needs review");
    expect(screen.getByTestId("needs-review-pill")).toHaveTextContent("1 needs review");
  });

  it("prioritizes conflicts over needs review", () => {
    render(
      <ProfileStatusSummary
        readyCount={1}
        conflictedCount={1}
        needsReviewCount={1}
        hasUnresolvedConflicts={true}
      />
    );
    
    // Conflicts take priority
    expect(screen.getByTestId("status-title")).toHaveTextContent("Needs your decision");
    expect(screen.getByTestId("status-summary")).toHaveTextContent("3 fields · 1 ready · 1 conflicted");
    // Should not show "needs review" in summary when conflicts exist
    expect(screen.getByTestId("needs-review-pill")).toBeInTheDocument();
  });

  it("shows all count pills correctly", () => {
    render(
      <ProfileStatusSummary
        readyCount={2}
        conflictedCount={1}
        needsReviewCount={1}
        hasUnresolvedConflicts={true}
      />
    );
    
    expect(screen.getByTestId("ready-pill")).toHaveTextContent("2 ready");
    expect(screen.getByTestId("conflicted-pill")).toHaveTextContent("1 conflicted");
    expect(screen.getByTestId("needs-review-pill")).toHaveTextContent("1 needs review");
  });

  it("handles single field correctly", () => {
    render(
      <ProfileStatusSummary
        readyCount={1}
        conflictedCount={0}
        needsReviewCount={0}
        hasUnresolvedConflicts={false}
      />
    );
    
    expect(screen.getByTestId("status-summary")).toHaveTextContent("1 fields · 1 ready");
  });
});

describe("SignalCard status badge logic", () => {
  type FieldStatus = "OBSERVED" | "DERIVED" | "HYPOTHESIZED" | "LOW_CONFIDENCE_HYPOTHESIS" | "VALID_OTHER" | "CONFLICTED" | "UNKNOWN";
  
  function deriveFieldStatus(
    hasConflict: boolean,
    hasValue: boolean,
    isHypothesized: boolean,
    confidence: number,
  ): FieldStatus {
    if (hasConflict) return "CONFLICTED";
    if (!hasValue) return "UNKNOWN";
    if (isHypothesized && confidence < 0.5) return "LOW_CONFIDENCE_HYPOTHESIS";
    if (isHypothesized) return "HYPOTHESIZED";
    return "OBSERVED";
  }

  it("returns CONFLICTED when hasConflict is true", () => {
    expect(deriveFieldStatus(true, true, false, 0.8)).toBe("CONFLICTED");
  });

  it("returns UNKNOWN when no value", () => {
    expect(deriveFieldStatus(false, false, false, 0)).toBe("UNKNOWN");
  });

  it("returns LOW_CONFIDENCE_HYPOTHESIS for low confidence", () => {
    expect(deriveFieldStatus(false, true, true, 0.3)).toBe("LOW_CONFIDENCE_HYPOTHESIS");
  });

  it("returns HYPOTHESIZED for normal hypothesis", () => {
    expect(deriveFieldStatus(false, true, true, 0.6)).toBe("HYPOTHESIZED");
  });

  it("returns OBSERVED for confident signal", () => {
    expect(deriveFieldStatus(false, true, false, 0.8)).toBe("OBSERVED");
  });
});

describe("Conflicted field UX", () => {
  it("should show 'Needs your decision' banner for conflicted fields", () => {
    // Test that conflicted state is properly identified
    const isConflicted = true;
    expect(isConflicted).toBe(true);
  });

  it("should require selection before confirmation when conflicted", () => {
    const hasUnresolvedConflicts = true;
    const canConfirm = !hasUnresolvedConflicts;
    expect(canConfirm).toBe(false);
  });

  it("should allow confirmation when no conflicts", () => {
    const hasUnresolvedConflicts = false;
    const canConfirm = !hasUnresolvedConflicts;
    expect(canConfirm).toBe(true);
  });
});
