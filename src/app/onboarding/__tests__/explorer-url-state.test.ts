import { describe, it, expect } from "vitest";
import {
  parseExplorerParam,
  serializeExplorerParam,
  explorerParamToFilter,
  filterToExplorerParam,
  resolveExplorerTabFromFilter,
} from "../explorer-url-state";

describe("explorer-url-state", () => {
  it("parses open and contextual explorer params", () => {
    expect(parseExplorerParam("open")).toEqual({ kind: "open" });
    expect(parseExplorerParam("risk:ai_training")).toEqual({ kind: "risk", key: "ai_training" });
    expect(parseExplorerParam("pillar:cloud_security")).toEqual({
      kind: "pillar",
      key: "cloud_security",
    });
  });

  it("serializes filters back to URL params", () => {
    expect(serializeExplorerParam({ kind: "open" })).toBe("open");
    expect(serializeExplorerParam({ kind: "risk", key: "tenant_isolation" })).toBe(
      "risk:tenant_isolation",
    );
  });

  it("maps URL params to explorer filters with default tabs", () => {
    expect(explorerParamToFilter({ kind: "risk", key: "ai_training" })).toMatchObject({
      riskKey: "ai_training",
      initialTab: "risks",
    });
    expect(explorerParamToFilter({ kind: "evidence", key: "SOC 2" })).toMatchObject({
      evidenceNeedId: "SOC 2",
      initialTab: "evidence-needs",
    });
  });

  it("round-trips filter context through URL encoding", () => {
    const filter = { capabilityKey: "sso_mfa", initialTab: "capabilities" as const };
    const param = filterToExplorerParam(filter);
    expect(param).toEqual({ kind: "capability", key: "sso_mfa" });
    if (!param) throw new Error("expected param");
    expect(explorerParamToFilter(param)).toMatchObject({
      capabilityKey: "sso_mfa",
      initialTab: "capabilities",
    });
  });

  it("resolves tab precedence from filter keys", () => {
    expect(resolveExplorerTabFromFilter({ riskKey: "x" })).toBe("risks");
    expect(resolveExplorerTabFromFilter({ evidenceNeedId: "policy" })).toBe("evidence-needs");
    expect(resolveExplorerTabFromFilter({ initialTab: "diagnostics" })).toBe("diagnostics");
  });
});
