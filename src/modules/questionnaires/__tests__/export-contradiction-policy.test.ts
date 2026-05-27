import type { ContradictionResolutionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { ContradictionExportRowInput } from "../export-contradiction-policy";
import {
  aggregateContradictionExportGate,
  buildContradictionExportNotices,
  classifyContradictionForExport,
  isContradictionUnresolvedForExport,
  mediumExportPolicyFromDb,
} from "../export-contradiction-policy";

function row(
  contradictionFound: boolean,
  severity: string | null,
  resolutionStatus: ContradictionResolutionStatus,
): ContradictionExportRowInput {
  return { contradictionFound, severity, resolutionStatus };
}

describe("isContradictionUnresolvedForExport", () => {
  it("is false when no contradiction", () => {
    expect(isContradictionUnresolvedForExport(false, "PENDING")).toBe(false);
  });
  it("is true for PENDING and STALE when found", () => {
    expect(isContradictionUnresolvedForExport(true, "PENDING")).toBe(true);
    expect(isContradictionUnresolvedForExport(true, "STALE")).toBe(true);
  });
  it("is false for resolved statuses", () => {
    expect(isContradictionUnresolvedForExport(true, "FALSE_POSITIVE")).toBe(false);
    expect(isContradictionUnresolvedForExport(true, "ACKNOWLEDGED")).toBe(false);
    expect(isContradictionUnresolvedForExport(true, "RESOLVED_ROW")).toBe(false);
    expect(isContradictionUnresolvedForExport(true, "RESOLVED_CANONICAL")).toBe(false);
  });
});

describe("classifyContradictionForExport", () => {
  it("blocks unresolved critical and high under WARN policy", () => {
    expect(classifyContradictionForExport(row(true, "critical", "PENDING"), "WARN")).toBe(
      "block",
    );
    expect(classifyContradictionForExport(row(true, "HIGH", "STALE"), "WARN")).toBe("block");
  });

  it("does not block when contradiction not found", () => {
    expect(classifyContradictionForExport(row(false, "high", "PENDING"), "BLOCK")).toBe("none");
  });

  it("does not block FALSE_POSITIVE / ACKNOWLEDGED / resolved", () => {
    expect(classifyContradictionForExport(row(true, "high", "FALSE_POSITIVE"), "BLOCK")).toBe(
      "none",
    );
    expect(classifyContradictionForExport(row(true, "high", "ACKNOWLEDGED"), "BLOCK")).toBe(
      "none",
    );
    expect(classifyContradictionForExport(row(true, "high", "RESOLVED_ROW"), "BLOCK")).toBe(
      "none",
    );
  });

  it("medium WARN warns only", () => {
    expect(classifyContradictionForExport(row(true, "medium", "PENDING"), "WARN")).toBe("warn");
  });

  it("medium BLOCK blocks", () => {
    expect(classifyContradictionForExport(row(true, "medium", "PENDING"), "BLOCK")).toBe("block");
  });

  it("null severity warns only", () => {
    expect(classifyContradictionForExport(row(true, null, "PENDING"), "BLOCK")).toBe("warn");
  });

  it("low warns only", () => {
    expect(classifyContradictionForExport(row(true, "low", "PENDING"), "BLOCK")).toBe("warn");
  });

  it("treats undefined row as none", () => {
    expect(classifyContradictionForExport(undefined, "BLOCK")).toBe("none");
  });
});

describe("aggregateContradictionExportGate", () => {
  it("aggregates blocking and warnings", () => {
    const r = aggregateContradictionExportGate(
      [
        row(true, "high", "PENDING"),
        row(true, "medium", "PENDING"),
        row(true, "low", "PENDING"),
      ],
      "WARN",
    );
    expect(r.blockingRowCount).toBe(1);
    expect(r.warningRowCount).toBe(2);
    expect(r.blocksExport).toBe(true);
  });

  it("blocks export on medium when policy BLOCK", () => {
    const r = aggregateContradictionExportGate([row(true, "medium", "PENDING")], "BLOCK");
    expect(r.blockingRowCount).toBe(1);
    expect(r.warningRowCount).toBe(0);
    expect(r.blocksExport).toBe(true);
  });

  it("does not block when only warnings", () => {
    const r = aggregateContradictionExportGate(
      [row(true, "medium", "PENDING"), row(true, "info", "PENDING")],
      "WARN",
    );
    expect(r.blockingRowCount).toBe(0);
    expect(r.warningRowCount).toBe(2);
    expect(r.blocksExport).toBe(false);
  });
});

describe("mediumExportPolicyFromDb", () => {
  it("maps BLOCK and defaults to WARN", () => {
    expect(mediumExportPolicyFromDb("BLOCK")).toBe("BLOCK");
    expect(mediumExportPolicyFromDb("WARN")).toBe("WARN");
    expect(mediumExportPolicyFromDb(undefined)).toBe("WARN");
    expect(mediumExportPolicyFromDb(null)).toBe("WARN");
  });
});

describe("buildContradictionExportNotices", () => {
  it("returns notices when counts positive", () => {
    const { notice, warnNotice } = buildContradictionExportNotices(2, 1);
    expect(notice).toContain("2");
    expect(warnNotice).toContain("1");
  });
  it("returns nulls when zero", () => {
    expect(buildContradictionExportNotices(0, 0)).toEqual({ notice: null, warnNotice: null });
  });
});
