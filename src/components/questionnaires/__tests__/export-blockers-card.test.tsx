// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportBlockersCard } from "../export-blockers-card";
import type { ExportBlockerCategory } from "@/modules/questionnaires/questionnaire-export-service";

// Next.js `<Link>` is server-rendered as an `<a>` during `renderToStaticMarkup`; stub it
// to the minimum necessary so snapshot-free assertions can match the href attribute
// without pulling in the Next app router in unit tests.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-label": ariaLabel,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-label"?: string;
  }) =>
    React.createElement(
      "a",
      { href, className, "aria-label": ariaLabel },
      children,
    ),
}));

function makeContradictionCategory(): ExportBlockerCategory {
  return {
    kind: "contradiction",
    gating: "block",
    title: "1 row contradicts an approved canonical answer",
    description:
      "Export is blocked until each contradiction is resolved or dismissed.",
    count: 1,
    rows: [
      {
        questionnaireItemId: "item-xyz",
        rowNumber: 8,
        questionPreview: "Do you enforce MFA for admin access?",
        topicName: "MFA",
        severity: "high",
        contradictionType: "boolean_polarity",
        resolutionStatus: "PENDING",
        message: "Row answer disagrees with approved canonical answer.",
        unresolvedReason: null,
        reviewDeepLink:
          "/app/questionnaires/qn-1/review?itemId=item-xyz#contradiction",
      },
    ],
  };
}

function makeXlsxCategory(): ExportBlockerCategory {
  return {
    kind: "xlsx_unavailable",
    gating: "block",
    title: "Excel export unavailable",
    description: "The original spreadsheet is no longer attached.",
    count: 1,
    rows: [],
  };
}

function makeUnansweredCategory(gating: "block" | "warn" = "warn"): ExportBlockerCategory {
  return {
    kind: "unanswered_row",
    gating,
    title:
      gating === "block"
        ? "1 row has not been answered yet"
        : "1 row has not been answered yet",
    description:
      gating === "block"
        ? "Export is blocked until every row has a reviewed answer."
        : "These rows will be left as they were in the source spreadsheet.",
    count: 1,
    rows: [
      {
        questionnaireItemId: "item-blank",
        rowNumber: 4,
        questionPreview: "How do you log access to production data?",
        topicName: "Access Control",
        severity: gating === "block" ? "high" : "medium",
        contradictionType: null,
        resolutionStatus: null,
        message: "Row has no answer yet (no_approved_answer).",
        unresolvedReason: "no_approved_answer",
        reviewDeepLink:
          "/app/questionnaires/qn-1/review?itemId=item-blank#contradiction",
      },
    ],
  };
}

function makeUncommittedCategory(): ExportBlockerCategory {
  return {
    kind: "uncommitted_suggestion",
    gating: "warn",
    title: "1 row has an unreviewed recommendation",
    description:
      "These rows show AI-drafted answers that the reviewer has not accepted.",
    count: 1,
    rows: [
      {
        questionnaireItemId: "item-draft",
        rowNumber: 7,
        questionPreview: "Describe your incident response process.",
        topicName: "Incident Response",
        severity: "low",
        contradictionType: null,
        resolutionStatus: null,
        message:
          "These rows show prepared answers that have not been accepted by a reviewer.",
        unresolvedReason: null,
        reviewDeepLink:
          "/app/questionnaires/qn-1/review?itemId=item-draft#contradiction",
      },
    ],
  };
}

function makeEvidenceConflictCategory(): ExportBlockerCategory {
  return {
    kind: "evidence_conflict",
    gating: "warn",
    title: "1 row has an unresolved evidence conflict",
    description:
      "Evidence sources disagreed during onboarding. This is separate from canonical contradictions.",
    count: 1,
    rows: [
      {
        questionnaireItemId: "item-ec",
        rowNumber: 11,
        questionPreview: "Where is customer data stored?",
        topicName: "Data Residency",
        severity: "medium",
        contradictionType: null,
        resolutionStatus: null,
        message: "Evidence doc A says EU; doc B says US.",
        unresolvedReason: null,
        reviewDeepLink:
          "/app/questionnaires/qn-1/review?itemId=item-ec#contradiction",
      },
    ],
  };
}

describe("ExportBlockersCard", () => {
  it("renders a success state when there are no blockers", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, { blockers: [] }),
    );
    expect(html).toContain("All checks passed");
    expect(html).toContain("Ready to export");
    expect(html).not.toContain("Blocks export");
  });

  it("renders contradiction blocker rows with row number, topic, severity, and deep link", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, {
        blockers: [makeContradictionCategory()],
      }),
    );
    expect(html).toContain("#8");
    expect(html).toContain("MFA");
    expect(html).toContain("Do you enforce MFA for admin access?");
    expect(html).toContain("High"); // severity pill label
    expect(html).toContain("Pending review"); // resolution pill
    expect(html).toContain(
      'href="/app/questionnaires/qn-1/review?itemId=item-xyz#contradiction"',
    );
    expect(html).toContain("Export blocked"); // overall header signal
  });

  it("renders questionnaire-level blockers without a row list", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, { blockers: [makeXlsxCategory()] }),
    );
    expect(html).toContain("Excel export unavailable");
    expect(html).toContain("The original spreadsheet is no longer attached.");
    // No `Open row` CTA should appear because the category has no rows.
    expect(html).not.toContain("Open row");
  });

  it("shows both blocking and warning tones side by side", () => {
    const warning: ExportBlockerCategory = {
      ...makeContradictionCategory(),
      gating: "warn",
      title: "1 row has an open contradiction",
      description: "These do not block export under current policy.",
      rows: [
        {
          ...makeContradictionCategory().rows[0]!,
          severity: "medium",
        },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, {
        blockers: [makeContradictionCategory(), warning],
      }),
    );
    expect(html).toContain("Blocks export");
    expect(html).toContain("Review before export");
    expect(html).toContain("Medium"); // warning severity pill label
  });

  it("renders unanswered_row category with row number, unresolved reason pill, and deep link", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, {
        blockers: [makeUnansweredCategory("warn")],
      }),
    );
    expect(html).toContain("#4");
    expect(html).toContain("How do you log access to production data?");
    expect(html).toContain("No approved answer"); // unresolved reason pill
    expect(html).toContain('href="/app/questionnaires/qn-1/review?itemId=item-blank#contradiction"');
  });

  it("escalates unanswered_row to a blocking visual when gating=block", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, {
        blockers: [makeUnansweredCategory("block")],
      }),
    );
    expect(html).toContain("Blocks export");
    expect(html).toContain("High"); // severity escalates with the gate
  });

  it("renders uncommitted_suggestion category as a warning with row detail", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, {
        blockers: [makeUncommittedCategory()],
      }),
    );
    expect(html).toContain("#7");
    expect(html).toContain("Describe your incident response process.");
    expect(html).toContain("Review before export");
    // Uncommitted is informational, severity is "low".
    expect(html).toContain("Low");
  });

  it("renders evidence_conflict category distinct from canonical contradictions", () => {
    const html = renderToStaticMarkup(
      React.createElement(ExportBlockersCard, {
        blockers: [makeEvidenceConflictCategory()],
      }),
    );
    expect(html).toContain("Where is customer data stored?");
    expect(html).toContain("EU");
    expect(html).toContain("Review before export");
  });
});
