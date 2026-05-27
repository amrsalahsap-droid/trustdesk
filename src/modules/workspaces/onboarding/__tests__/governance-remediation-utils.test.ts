import { describe, it, expect } from "vitest";
import {
  applyGovernanceRemediationUpdate,
  countOpenGovernanceTasks,
  collectSatisfiedEvidenceTypes,
  isGovernanceTaskResolved,
} from "../governance-remediation-utils";

describe("governance-remediation-utils", () => {
  it("identifies terminal statuses", () => {
    expect(isGovernanceTaskResolved("confirmed")).toBe(true);
    expect(isGovernanceTaskResolved("not_applicable")).toBe(true);
    expect(isGovernanceTaskResolved("open")).toBe(false);
    expect(isGovernanceTaskResolved("evidence_added")).toBe(false);
  });

  it("counts only non-resolved tasks", () => {
    const remediations = {
      t1: applyGovernanceRemediationUpdate(undefined, {
        taskId: "t1",
        action: "confirm",
        userId: "u1",
      }),
      t2: applyGovernanceRemediationUpdate(undefined, {
        taskId: "t2",
        action: "assign_owner",
        userId: "u1",
        owner: "owner@example.com",
      }),
    };
    expect(countOpenGovernanceTasks(["t1", "t2", "t3"], remediations)).toBe(2);
  });

  it("collects satisfied evidence types across tasks", () => {
    const remediations = {
      t1: {
        ...applyGovernanceRemediationUpdate(undefined, {
          taskId: "t1",
          action: "evidence_uploaded",
          userId: "u1",
          evidenceType: "AI Policy",
        }),
        satisfiedEvidenceTypes: ["AI Policy"],
      },
    };
    expect(collectSatisfiedEvidenceTypes(remediations)).toEqual(["AI Policy"]);
  });

  it("appends audit history on each update", () => {
    const first = applyGovernanceRemediationUpdate(undefined, {
      taskId: "task_a",
      action: "assign_owner",
      userId: "user_1",
      owner: "sec@co.com",
    });
    expect(first.status).toBe("assigned");
    expect(first.auditHistory).toHaveLength(1);

    const second = applyGovernanceRemediationUpdate(first, {
      taskId: "task_a",
      action: "confirm",
      userId: "user_1",
      note: "Reviewed manually",
    });
    expect(second.status).toBe("confirmed");
    expect(second.auditHistory).toHaveLength(2);
    expect(second.owner).toBe("sec@co.com");
  });
});
