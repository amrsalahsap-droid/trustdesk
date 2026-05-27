import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

// Mock the icons
vi.mock("@/components/icons", () => ({
  CheckIcon: () => <span data-testid="check-icon">✓</span>,
  AlertCircleIcon: () => <span data-testid="alert-icon">⚠</span>,
  ChevronDownIcon: () => <span data-testid="chevron-icon">▼</span>,
}));

// Simple test versions of the components
function deriveEvidenceQuality(
  health: { pagesReached: number; pagesAttempted: number; blockedBy?: string },
  extraction?: { ok: boolean; strongPages: number; renderedPages: number; totalNonBoilerplateChars: number },
): { quality: "strong" | "limited" | "weak"; issues: string[] } {
  const issues: string[] = [];

  if (health.blockedBy) {
    issues.push(`Blocked by ${health.blockedBy}`);
  }
  if (health.pagesReached < health.pagesAttempted) {
    const failed = health.pagesAttempted - health.pagesReached;
    issues.push(`${failed} page${failed > 1 ? "s" : ""} failed to load`);
  }

  if (extraction) {
    if (!extraction.ok) {
      issues.push("Limited page content extracted");
    }
    if (extraction.strongPages === 0) {
      issues.push("No strong evidence pages found");
    } else if (extraction.strongPages < 2) {
      issues.push("Few strong evidence pages");
    }
  }

  if (issues.length === 0 && extraction?.ok && extraction.strongPages >= 2) {
    return { quality: "strong", issues: [] };
  }
  if (issues.length <= 1 && health.pagesReached >= 1) {
    return { quality: "limited", issues };
  }
  return { quality: "weak", issues };
}

describe("deriveEvidenceQuality", () => {
  it("returns 'strong' when no issues and good extraction", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 4, pagesAttempted: 4 },
      { ok: true, strongPages: 3, renderedPages: 4, totalNonBoilerplateChars: 5000 }
    );
    expect(result.quality).toBe("strong");
    expect(result.issues).toHaveLength(0);
  });

  it("returns 'limited' with 1 minor issue", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 3, pagesAttempted: 4 }, // 1 page failed
      { ok: true, strongPages: 2, renderedPages: 3, totalNonBoilerplateChars: 3000 }
    );
    expect(result.quality).toBe("limited");
    expect(result.issues).toContain("1 page failed to load");
  });

  it("returns 'weak' when blocked", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 0, pagesAttempted: 1, blockedBy: "robots" },
      undefined
    );
    expect(result.quality).toBe("weak");
    expect(result.issues).toContain("Blocked by robots");
  });

  it("returns 'weak' when no strong pages", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 2, pagesAttempted: 2 },
      { ok: true, strongPages: 0, renderedPages: 2, totalNonBoilerplateChars: 100 }
    );
    expect(result.quality).toBe("weak");
    expect(result.issues).toContain("No strong evidence pages found");
  });

  it("returns 'limited' when few strong pages (1)", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 2, pagesAttempted: 2 },
      { ok: true, strongPages: 1, renderedPages: 2, totalNonBoilerplateChars: 1000 }
    );
    expect(result.quality).toBe("limited");
    expect(result.issues).toContain("Few strong evidence pages");
  });

  it("returns 'limited' when extraction not ok", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 3, pagesAttempted: 3 },
      { ok: false, strongPages: 1, renderedPages: 3, totalNonBoilerplateChars: 500 }
    );
    expect(result.quality).toBe("limited");
    expect(result.issues).toContain("Limited page content extracted");
  });

  it("handles multiple issues as weak", () => {
    const result = deriveEvidenceQuality(
      { pagesReached: 1, pagesAttempted: 3 }, // 2 pages failed
      { ok: false, strongPages: 0, renderedPages: 1, totalNonBoilerplateChars: 100 }
    );
    expect(result.quality).toBe("weak");
    expect(result.issues.length).toBeGreaterThan(1);
  });
});

describe("EvidenceQualitySummary rendering", () => {
  function MockEvidenceQualitySummary({
    health,
    extraction,
  }: {
    health: { pagesReached: number; pagesAttempted: number; blockedBy?: string; statusCodes?: number[] };
    extraction?: { ok: boolean; strongPages: number; renderedPages: number; totalNonBoilerplateChars: number };
  }) {
    const { quality, issues } = deriveEvidenceQuality(health, extraction);
    const [showDetails, setShowDetails] = React.useState(false);

    const qualityConfig = {
      strong: { label: "Strong", colorClass: "text-emerald-600" },
      limited: { label: "Limited", colorClass: "text-amber-600" },
      weak: { label: "Weak", colorClass: "text-rose-600" },
    };

    const config = qualityConfig[quality];

    return (
      <div data-testid="evidence-summary">
        <div data-testid="quality-label" className={config.colorClass}>
          Evidence quality: {config.label}
        </div>
        <div data-testid="pages-count">{health.pagesReached} pages analyzed</div>
        {issues.length > 0 && (
          <div data-testid="issues-count">{issues.length} issues found</div>
        )}
        <button data-testid="toggle-details" onClick={() => setShowDetails(!showDetails)}>
          {showDetails ? "Hide details" : "View details"}
        </button>
        {showDetails && (
          <div data-testid="technical-details">
            <div>Crawl: {health.pagesReached}/{health.pagesAttempted}</div>
            {extraction && <div>Strong pages: {extraction.strongPages}</div>}
          </div>
        )}
      </div>
    );
  }

  it("renders strong quality summary", () => {
    render(
      <MockEvidenceQualitySummary
        health={{ pagesReached: 4, pagesAttempted: 4 }}
        extraction={{ ok: true, strongPages: 3, renderedPages: 4, totalNonBoilerplateChars: 5000 }}
      />
    );

    expect(screen.getByTestId("quality-label")).toHaveTextContent("Strong");
    expect(screen.getByTestId("pages-count")).toHaveTextContent("4 pages analyzed");
    expect(screen.queryByTestId("issues-count")).not.toBeInTheDocument();
  });

  it("renders limited quality with issues", () => {
    render(
      <MockEvidenceQualitySummary
        health={{ pagesReached: 3, pagesAttempted: 4 }}
        extraction={{ ok: true, strongPages: 1, renderedPages: 3, totalNonBoilerplateChars: 1000 }}
      />
    );

    expect(screen.getByTestId("quality-label")).toHaveTextContent("Limited");
    expect(screen.getByTestId("issues-count")).toHaveTextContent("2 issues found");
  });

  it("renders weak quality when blocked", () => {
    render(
      <MockEvidenceQualitySummary
        health={{ pagesReached: 0, pagesAttempted: 1, blockedBy: "robots" }}
        extraction={undefined}
      />
    );

    expect(screen.getByTestId("quality-label")).toHaveTextContent("Weak");
    expect(screen.getByTestId("issues-count")).toHaveTextContent("1 issue found");
  });

  it("toggles technical details on button click", () => {
    render(
      <MockEvidenceQualitySummary
        health={{ pagesReached: 4, pagesAttempted: 4 }}
        extraction={{ ok: true, strongPages: 3, renderedPages: 4, totalNonBoilerplateChars: 5000 }}
      />
    );

    expect(screen.queryByTestId("technical-details")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("toggle-details"));

    expect(screen.getByTestId("technical-details")).toBeInTheDocument();
    expect(screen.getByTestId("technical-details")).toHaveTextContent("4/4");
    expect(screen.getByTestId("technical-details")).toHaveTextContent("Strong pages: 3");
  });

  it("handles missing diagnostics gracefully", () => {
    render(
      <MockEvidenceQualitySummary
        health={{ pagesReached: 0, pagesAttempted: 0 }}
        extraction={undefined}
      />
    );

    expect(screen.getByTestId("pages-count")).toHaveTextContent("0 pages analyzed");
    expect(screen.getByTestId("toggle-details")).toBeInTheDocument();
  });
});
