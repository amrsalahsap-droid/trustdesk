import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvidenceQualitySummary } from "../onboarding-workspace-form";

// Mock data for testing
const mockExtraction = {
  ok: true,
  strongPages: 3,
  renderedPages: 0,
  totalNonBoilerplateChars: 5000,
};

const mockHealth = {
  pagesReached: 4,
  pagesAttempted: 4,
  blockedBy: undefined,
  statusCodes: [200, 200, 200, 200],
};

const mockBusiness = {
  ok: true,
  observedFields: 5,
};

describe("Rendered Pages UI Clarification", () => {
  it("shows 'JS-rendered: 0' instead of 'Rendered: 0'", () => {
    render(
      <EvidenceQualitySummary
        health={mockHealth}
        extraction={mockExtraction}
        business={mockBusiness}
      />
    );

    // Should show the new label
    expect(screen.getByText("JS-rendered: 0")).toBeInTheDocument();
    
    // Should not show the old label
    expect(screen.queryByText("Rendered: 0")).not.toBeInTheDocument();
  });

  it("shows tooltip when rendered pages is 0", () => {
    render(
      <EvidenceQualitySummary
        health={mockHealth}
        extraction={mockExtraction}
        business={mockBusiness}
      />
    );

    // The tooltip text should be present in the DOM (though hidden by default)
    expect(screen.getByText("0 means static HTML extraction was enough; browser rendering was not needed.")).toBeInTheDocument();
  });

  it("does not show tooltip when rendered pages > 0", () => {
    const extractionWithRendered = {
      ...mockExtraction,
      renderedPages: 2,
    };

    render(
      <EvidenceQualitySummary
        health={mockHealth}
        extraction={extractionWithRendered}
        business={mockBusiness}
      />
    );

    // Should show the value without tooltip
    expect(screen.getByText("JS-rendered: 2")).toBeInTheDocument();
    
    // Tooltip should not be present
    expect(screen.queryByText("0 means static HTML extraction was enough; browser rendering was not needed.")).not.toBeInTheDocument();
  });

  it("shows other extraction metrics correctly", () => {
    render(
      <EvidenceQualitySummary
        health={mockHealth}
        extraction={mockExtraction}
        business={mockBusiness}
      />
    );

    // Other metrics should still display correctly
    expect(screen.getByText("Strong pages: 3")).toBeInTheDocument();
    expect(screen.getByText("Content chars: 5,000")).toBeInTheDocument();
  });

  it("keeps metric in details/debug area, not as primary", () => {
    render(
      <EvidenceQualitySummary
        health={mockHealth}
        extraction={mockExtraction}
        business={mockBusiness}
      />
    );

    // The extraction section should be present but not prominent
    expect(screen.getByText("Extraction")).toBeInTheDocument();
    
    // JS-rendered should be in the extraction details section
    const renderedElement = screen.getByText("JS-rendered: 0");
    expect(renderedElement.closest('.font-mono')).toBeInTheDocument(); // Should be in the monospace grid
  });

  it("handles extraction being undefined gracefully", () => {
    render(
      <EvidenceQualitySummary
        health={mockHealth}
        extraction={undefined}
        business={mockBusiness}
      />
    );

    // Should not show extraction section
    expect(screen.queryByText("Extraction")).not.toBeInTheDocument();
    expect(screen.queryByText("JS-rendered:")).not.toBeInTheDocument();
  });
});
