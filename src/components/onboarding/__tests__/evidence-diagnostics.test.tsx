import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EvidenceDiagnostics } from "../evidence-diagnostics";

// Mock the icons
vi.mock("@/components/icons", () => ({
  CheckIcon: () => <div data-testid="check-icon" />,
  AlertCircleIcon: () => <div data-testid="alert-circle-icon" />,
  WarningIcon: () => <div data-testid="warning-icon" />,
  ShieldIcon: () => <div data-testid="shield-icon" />,
  BuildingIcon: () => <div data-testid="building-icon" />,
  FileTextIcon: () => <div data-testid="file-text-icon" />,
  StarIcon: () => <div data-testid="star-icon" />,
  ChevronDownIcon: () => <div data-testid="chevron-down-icon" />,
  ChevronUpIcon: () => <div data-testid="chevron-up-icon" />,
  InfoIcon: () => <div data-testid="info-icon" />,
  XCircleIcon: () => <div data-testid="x-circle-icon" />,
  ClockIcon: () => <div data-testid="clock-icon" />,
  GlobeIcon: () => <div data-testid="globe-icon" />,
  LockIcon: () => <div data-testid="lock-icon" />,
}));

describe("EvidenceDiagnostics", () => {
  const mockDomainSummary = {
    pagesAttempted: 5,
    pagesFetched: 4,
    highValuePagesFound: 3,
    securityLegalPagesFound: 2,
    totalUsefulChars: 15000,
    issues: [],
    durationMs: 3000,
  };

  const mockFieldEvidence = [
    {
      fieldKey: "industry",
      fieldName: "Industry",
      strength: "strong" as const,
      supportScore: 85,
      evidenceCoverage: 80,
      topCandidate: {
        value: "Software",
        confidenceBand: "high",
        reasons: ["Direct quote", "High-value source"],
      },
      isConflicted: false,
      evidenceRefs: [
        {
          sourceUrl: "https://example.com/about",
          pageType: "about",
          snippet: "We are a software company",
          signalType: "direct_quote",
        },
      ],
    },
    {
      fieldKey: "compliance",
      fieldName: "Compliance",
      strength: "medium" as const,
      supportScore: 65,
      evidenceCoverage: 60,
      topCandidate: {
        value: "GDPR",
        confidenceBand: "medium",
        reasons: ["Privacy page"],
      },
      isConflicted: false,
      evidenceRefs: [
        {
          sourceUrl: "https://example.com/privacy",
          pageType: "privacy",
          snippet: "GDPR compliant privacy policy",
          signalType: "compliance_language",
        },
      ],
    },
  ];

  const mockHandlers = {
    onAddEvidence: vi.fn(),
    onTryAnotherUrl: vi.fn(),
    onContinueManually: vi.fn(),
  };

  it("renders domain evidence summary with strong evidence", () => {
    render(
      <EvidenceDiagnostics
        domainSummary={mockDomainSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Domain evidence:")).toBeInTheDocument();
    expect(screen.getByText("Strong evidence collected")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 pages fetched")).toBeInTheDocument();
    expect(screen.getByText("3 high-value pages")).toBeInTheDocument();
    expect(screen.getByText("2 security/legal pages")).toBeInTheDocument();
  });

  it("renders field-level evidence with strength indicators", () => {
    render(
      <EvidenceDiagnostics
        domainSummary={mockDomainSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Field-level evidence")).toBeInTheDocument();
    expect(screen.getByText("Industry")).toBeInTheDocument();
    expect(screen.getByText("Strong")).toBeInTheDocument();
    expect(screen.getByText("Compliance")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("Software")).toBeInTheDocument();
    expect(screen.getByText("(high confidence)")).toBeInTheDocument();
  });

  it("shows weak evidence recovery messaging", () => {
    const weakFieldEvidence = [
      {
        ...mockFieldEvidence[0],
        strength: "weak" as const,
        supportScore: 25,
        evidenceCoverage: 20,
        topCandidate: undefined,
      },
    ];

    render(
      <EvidenceDiagnostics
        domainSummary={mockDomainSummary}
        fieldEvidence={weakFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Not enough evidence. Please confirm manually.")).toBeInTheDocument();
  });

  it("shows conflicted field messaging", () => {
    const conflictedFieldEvidence = [
      {
        ...mockFieldEvidence[0],
        isConflicted: true,
      },
    ];

    render(
      <EvidenceDiagnostics
        domainSummary={mockDomainSummary}
        fieldEvidence={conflictedFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Conflicted")).toBeInTheDocument();
    expect(screen.getByText("Multiple conflicting candidates found. Please review and confirm.")).toBeInTheDocument();
  });

  it("displays accurate 403 blocked messaging", () => {
    const blockedSummary = {
      ...mockDomainSummary,
      pagesFetched: 0,
      blockReason: "blocked" as const,
      issues: [
        {
          type: "error" as const,
          message: "Access forbidden (403)",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={blockedSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Website blocked automated access")).toBeInTheDocument();
    expect(screen.getByText("We reached the site, but it refused automated access (403 Forbidden).")).toBeInTheDocument();
  });

  it("displays rate limited messaging", () => {
    const rateLimitedSummary = {
      ...mockDomainSummary,
      pagesFetched: 1,
      blockReason: "rate_limited" as const,
      issues: [
        {
          type: "warning" as const,
          message: "Rate limited (429)",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={rateLimitedSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Rate limited by website")).toBeInTheDocument();
    expect(screen.getByText("The site is limiting automated requests (429 Too Many Requests).")).toBeInTheDocument();
  });

  it("shows recovery options for weak evidence", () => {
    const weakSummary = {
      ...mockDomainSummary,
      pagesFetched: 1,
      highValuePagesFound: 0,
    };

    render(
      <EvidenceDiagnostics
        domainSummary={weakSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Evidence collection incomplete")).toBeInTheDocument();
    expect(screen.getByText("Add public page URL")).toBeInTheDocument();
    expect(screen.getByText("Try another URL")).toBeInTheDocument();
    expect(screen.getByText("Continue manually")).toBeInTheDocument();
  });

  it("expands and collapses field details", () => {
    render(
      <EvidenceDiagnostics
        domainSummary={mockDomainSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    // Initially collapsed
    expect(screen.queryByText("Evidence sources:")).not.toBeInTheDocument();

    // Click expand button
    const expandButton = screen.getByTestId("chevron-down-icon");
    fireEvent.click(expandButton);

    // Should show expanded details
    expect(screen.getByText("Evidence sources:")).toBeInTheDocument();
    expect(screen.getByText("about")).toBeInTheDocument();
    expect(screen.getByText('"We are a software company"')).toBeInTheDocument();
  });

  it("expands and collapses domain details", () => {
    render(
      <EvidenceDiagnostics
        domainSummary={mockDomainSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    // Initially collapsed
    expect(screen.queryByText("Success Rate")).not.toBeInTheDocument();

    // Click show details button
    fireEvent.click(screen.getByText("Show details"));

    // Should show expanded details
    expect(screen.getByText("Success Rate")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Content Found")).toBeInTheDocument();
    expect(screen.getByText("15k chars")).toBeInTheDocument();
  });

  it("calls recovery handlers when buttons are clicked", () => {
    const blockedSummary = {
      ...mockDomainSummary,
      blockReason: "blocked" as const,
    };

    render(
      <EvidenceDiagnostics
        domainSummary={blockedSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    fireEvent.click(screen.getByText("Add public page URL"));
    expect(mockHandlers.onAddEvidence).toHaveBeenCalled();

    fireEvent.click(screen.getByText("Continue manually"));
    expect(mockHandlers.onContinueManually).toHaveBeenCalled();
  });

  it("shows issues list when issues are present", () => {
    const summaryWithIssues = {
      ...mockDomainSummary,
      issues: [
        {
          type: "error" as const,
          message: "Connection failed",
          url: "https://example.com/page1",
        },
        {
          type: "warning" as const,
          message: "Low content quality",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={summaryWithIssues}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    // Should show issues count
    expect(screen.getByText("2 issues")).toBeInTheDocument();

    // Expand details to see issues list
    fireEvent.click(screen.getByText("Show details"));
    expect(screen.getByText("Issues detected:")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(screen.getByText("Low content quality")).toBeInTheDocument();
  });

  it("handles unknown evidence strength", () => {
    const unknownSummary = {
      ...mockDomainSummary,
      pagesFetched: 0,
      pagesAttempted: 0,
    };

    const unknownFieldEvidence = [
      {
        ...mockFieldEvidence[0],
        strength: "unknown" as const,
        supportScore: 0,
        evidenceCoverage: 0,
        topCandidate: undefined,
      },
    ];

    render(
      <EvidenceDiagnostics
        domainSummary={unknownSummary}
        fieldEvidence={unknownFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("No evidence collected")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Not enough evidence. Please confirm manually.")).toBeInTheDocument();
  });

  it("displays server error messaging", () => {
    const serverErrorSummary = {
      ...mockDomainSummary,
      pagesFetched: 0,
      blockReason: "server_error" as const,
      issues: [
        {
          type: "error" as const,
          message: "Internal server error",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={serverErrorSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Server errors encountered")).toBeInTheDocument();
    expect(screen.getByText("The website is experiencing technical issues (5xx errors).")).toBeInTheDocument();
  });

  it("displays DNS error messaging", () => {
    const dnsErrorSummary = {
      ...mockDomainSummary,
      pagesFetched: 0,
      blockReason: "dns_error" as const,
      issues: [
        {
          type: "error" as const,
          message: "DNS resolution failed",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={dnsErrorSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Domain not found")).toBeInTheDocument();
    expect(screen.getByText("The domain name could not be resolved (DNS error).")).toBeInTheDocument();
  });

  it("displays timeout messaging", () => {
    const timeoutSummary = {
      ...mockDomainSummary,
      pagesFetched: 1,
      blockReason: "timeout" as const,
      issues: [
        {
          type: "warning" as const,
          message: "Request timeout",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={timeoutSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Request timeout")).toBeInTheDocument();
    expect(screen.getByText("The website took too long to respond.")).toBeInTheDocument();
  });

  it("displays no content messaging", () => {
    const noContentSummary = {
      ...mockDomainSummary,
      pagesFetched: 2,
      totalUsefulChars: 500,
      blockReason: "no_content" as const,
      issues: [
        {
          type: "warning" as const,
          message: "No useful content found",
        },
      ],
    };

    render(
      <EvidenceDiagnostics
        domainSummary={noContentSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("No useful content found")).toBeInTheDocument();
    expect(screen.getByText("The pages were accessible but didn't contain meaningful content.")).toBeInTheDocument();
  });

  it("calculates correct domain strength for various scenarios", () => {
    // Test strong evidence
    const strongSummary = {
      pagesAttempted: 5,
      pagesFetched: 5,
      highValuePagesFound: 3,
      securityLegalPagesFound: 2,
      totalUsefulChars: 15000,
      issues: [],
      durationMs: 3000,
    };

    const { rerender } = render(
      <EvidenceDiagnostics
        domainSummary={strongSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Strong evidence collected")).toBeInTheDocument();

    // Test weak evidence with 403
    const blockedSummary = {
      ...strongSummary,
      blockReason: "blocked" as const,
    };

    rerender(
      <EvidenceDiagnostics
        domainSummary={blockedSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("Weak evidence")).toBeInTheDocument();
  });

  it("shows appropriate recovery message based on block reason", () => {
    const blockedSummary = {
      ...mockDomainSummary,
      blockReason: "blocked" as const,
    };

    render(
      <EvidenceDiagnostics
        domainSummary={blockedSummary}
        fieldEvidence={mockFieldEvidence}
        {...mockHandlers}
      />
    );

    expect(screen.getByText("The website blocked automated access. You can provide specific page URLs (like /security or /privacy) or continue manually.")).toBeInTheDocument();
  });
});
