/**
 * Tests for Contradiction Persistence Service
 *
 * Coverage:
 * - Save contradiction result
 * - Save no-contradiction result
 * - Update resolution status
 * - Query with filters
 * - Canonical version pinning
 * - Stale detection
 * - Row conflict status (evidence vs canonical)
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  saveContradictionResult,
  upsertContradictionDetection,
  saveNoContradiction,
  updateContradictionResolution,
  getContradictionResult,
  getContradictionForItem,
  queryContradictions,
  getContradictionSummary,
  markResultsAsStale,
  checkRerunNeeded,
  getRowConflictStatus,
  deleteContradictionResult,
} from "../persistence-service";
import type { SaveContradictionInput } from "../persistence-types";

// Test helpers
async function createWorkspace(name: string) {
  return prisma.workspace.create({
    data: { name, slug: name.toLowerCase().replace(/\s+/g, "-") },
  });
}

async function createUser(email: string) {
  return prisma.user.create({
    data: { email, name: "Test User", passwordHash: "test" },
  });
}

async function createTopic(workspaceId: string, key: string, name: string) {
  return prisma.knowledgeTopic.create({
    data: { workspaceId, key, name, embedding: [] },
  });
}

async function createQuestionnaire(workspaceId: string, title: string) {
  return prisma.questionnaire.create({
    data: { workspaceId, title, sourceFileName: "test.xlsx" },
  });
}

async function createQuestionnaireItem(
  workspaceId: string,
  questionnaireId: string,
  question: string = "Test question?",
) {
  return prisma.questionnaireItem.create({
    data: {
      workspaceId,
      questionnaireId,
      question,
      suggestedAnswer: "Suggested",
      finalAnswer: "Final",
      sortOrder: 1,
    },
  });
}

async function createAnswer(
  workspaceId: string,
  topicId: string,
  title: string,
  versionNumber: number = 1,
) {
  return prisma.answerLibraryItem.create({
    data: {
      workspaceId,
      topicId,
      title,
      answer: "Canonical answer content",
      governanceStatus: "APPROVED_FOR_EXPORT",
      approvalScope: "EXPORT_ALLOWED",
      exportSafe: true,
      versionNumber,
      embedding: [],
    },
  });
}

describe("persistence-service", () => {
  let workspace: { id: string };
  let user: { id: string };
  let topic: { id: string; key: string };
  let questionnaire: { id: string };
  let item: { id: string };
  let answer: { id: string; versionNumber: number };

  beforeEach(async () => {
    workspace = await createWorkspace("Test Workspace");
    user = await createUser("test@test.com");
    topic = await createTopic(workspace.id, "access_control", "Access Control");
    questionnaire = await createQuestionnaire(workspace.id, "Test Questionnaire");
    item = await createQuestionnaireItem(workspace.id, questionnaire.id);
    answer = await createAnswer(workspace.id, topic.id, "Access Control Policy", 1);
  });

  afterAll(async () => {
    // Cleanup in order
    await prisma.contradictionResult.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.questionnaireItem.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.questionnaire.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.answerLibraryItem.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.knowledgeTopic.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  describe("saveContradictionResult", () => {
    it("should save a contradiction result with all fields", async () => {
      const input: SaveContradictionInput = {
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        contradictionType: "boolean_polarity",
        severity: "high",
        message: "RBAC assertion contradicts canonical",
        reason: "Canonical requires RBAC, row says no RBAC",
        rowAnswerExcerpt: "We do not use RBAC",
        canonicalAnswerId: answer.id,
        canonicalAnswerExcerpt: "We implement RBAC",
        canonicalVersionNumber: answer.versionNumber,
        topicId: topic.id,
        topicKey: topic.key,
        subControlKey: "rbac",
        detectorVersion: "1.0.0",
        ruleId: "access_control_rbac_polarity",
        rulePackVersion: "access_control@1.0.0",
      };

      const result = await saveContradictionResult(input);

      expect(result.contradictionFound).toBe(true);
      expect(result.contradictionType).toBe("boolean_polarity");
      expect(result.severity).toBe("high");
      expect(result.canonicalAnswerId).toBe(answer.id);
      expect(result.canonicalVersionNumber).toBe(1);
      expect(result.topicId).toBe(topic.id);
      expect(result.subControlKey).toBe("rbac");
      expect(result.resolutionStatus).toBe("PENDING");
      expect(result.isStale).toBe(false);
    });

    it("should upsert existing result for same questionnaire item", async () => {
      const input: SaveContradictionInput = {
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      };

      const first = await saveContradictionResult(input);

      // Update with new severity and message
      const second = await saveContradictionResult({
        ...input,
        severity: "critical",
        message: "Updated message",
      });

      expect(second.id).toBe(first.id); // Same record updated
      expect(second.severity).toBe("critical");
      expect(second.message).toBe("Updated message");
      expect(second.resolutionStatus).toBe("PENDING");
    });

    it("preserves terminal resolution when re-detecting with same canonical version", async () => {
      const input: SaveContradictionInput = {
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: answer.versionNumber,
        severity: "high",
      };
      const first = await saveContradictionResult(input);
      await prisma.contradictionResult.update({
        where: { id: first.id },
        data: {
          resolutionStatus: "ACKNOWLEDGED",
          resolvedAt: new Date(),
          resolutionAction: "KEEP_ROW",
        },
      });
      const second = await upsertContradictionDetection({
        ...input,
        severity: "critical",
      });
      expect(second.id).toBe(first.id);
      expect(second.resolutionStatus).toBe("ACKNOWLEDGED");
      expect(second.severity).toBe("high");
    });

    it("should truncate long excerpts", async () => {
      const longText = "a".repeat(2000);

      const input: SaveContradictionInput = {
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        message: longText,
        rowAnswerExcerpt: longText,
        canonicalAnswerExcerpt: longText,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      };

      const result = await saveContradictionResult(input);

      expect(result.message?.length).toBeLessThan(1005);
      expect(result.rowAnswerExcerpt?.length).toBeLessThan(1005);
      expect(result.message?.endsWith("...")).toBe(true);
    });
  });

  describe("saveNoContradiction", () => {
    it("should save a negative contradiction result", async () => {
      const result = await saveNoContradiction({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      expect(result.contradictionFound).toBe(false);
      expect(result.severity).toBeNull();
      expect(result.message).toBe("No canonical contradiction detected");
    });
  });

  describe("updateContradictionResolution", () => {
    it("should update resolution status", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const updated = await updateContradictionResolution(saved.id, {
        resolutionStatus: "ACKNOWLEDGED",
        resolvedByUserId: user.id,
        resolutionNote: "Acknowledged as valid deviation",
        resolutionAction: "ACKNOWLEDGE",
      });

      expect(updated).not.toBeNull();
      expect(updated?.resolutionStatus).toBe("ACKNOWLEDGED");
      expect(updated?.resolvedByUserId).toBe(user.id);
      expect(updated?.resolutionAction).toBe("ACKNOWLEDGE");
      expect(updated?.resolvedAt).not.toBeNull();
    });

    it("should return null for non-existent result", async () => {
      const updated = await updateContradictionResolution("non-existent-id", {
        resolutionStatus: "RESOLVED_ROW",
      });

      expect(updated).toBeNull();
    });
  });

  describe("getContradictionResult", () => {
    it("should retrieve a saved result", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        severity: "high",
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const retrieved = await getContradictionResult(saved.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(saved.id);
      expect(retrieved?.severity).toBe("high");
    });

    it("should return null for non-existent result", async () => {
      const result = await getContradictionResult("non-existent-id");
      expect(result).toBeNull();
    });
  });

  describe("getContradictionForItem", () => {
    it("should retrieve result by questionnaire item ID", async () => {
      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const retrieved = await getContradictionForItem(item.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.questionnaireItemId).toBe(item.id);
    });
  });

  describe("queryContradictions", () => {
    beforeEach(async () => {
      // Create multiple items and contradictions for filtering tests
      const item2 = await createQuestionnaireItem(workspace.id, questionnaire.id, "Q2");
      const topic2 = await createTopic(workspace.id, "mfa", "MFA");

      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        severity: "high",
        topicId: topic.id,
        subControlKey: "rbac",
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item2.id,
        contradictionFound: true,
        severity: "critical",
        topicId: topic2.id,
        subControlKey: "admin_mfa",
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });
    });

    it("should filter by severity", async () => {
      const critical = await queryContradictions({
        workspaceId: workspace.id,
        severity: "critical",
      });

      expect(critical).toHaveLength(1);
      expect(critical[0].severity).toBe("critical");
    });

    it("should filter by topic", async () => {
      const results = await queryContradictions({
        workspaceId: workspace.id,
        topicId: topic.id,
      });

      expect(results).toHaveLength(1);
      expect(results[0].topicId).toBe(topic.id);
    });

    it("should filter by sub-control key", async () => {
      const results = await queryContradictions({
        workspaceId: workspace.id,
        subControlKey: "rbac",
      });

      expect(results).toHaveLength(1);
      expect(results[0].subControlKey).toBe("rbac");
    });

    it("should filter by resolution status", async () => {
      const pending = await queryContradictions({
        workspaceId: workspace.id,
        resolutionStatus: "PENDING",
      });

      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((r) => r.resolutionStatus === "PENDING")).toBe(true);
    });

    it("should filter by contradictionFound", async () => {
      const found = await queryContradictions({
        workspaceId: workspace.id,
        contradictionFound: true,
      });

      expect(found.every((r) => r.contradictionFound)).toBe(true);
    });
  });

  describe("getContradictionSummary", () => {
    it("should return summary statistics", async () => {
      // Create contradictions with different severities and statuses
      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        severity: "critical",
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const summary = await getContradictionSummary(workspace.id);

      expect(summary.totalDetected).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.bySeverity.critical).toBe(1);
    });
  });

  describe("markResultsAsStale", () => {
    it("should mark results as stale when canonical is updated", async () => {
      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const markedCount = await markResultsAsStale({
        canonicalAnswerId: answer.id,
        newVersionNumber: 2,
      });

      expect(markedCount).toBe(1);

      const updated = await getContradictionForItem(item.id);
      expect(updated?.isStale).toBe(true);
      expect(updated?.resolutionStatus).toBe("STALE");
    });

    it("should not mark already resolved results as stale", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      // Mark as resolved
      await updateContradictionResolution(saved.id, {
        resolutionStatus: "RESOLVED_ROW",
      });

      const markedCount = await markResultsAsStale({
        canonicalAnswerId: answer.id,
        newVersionNumber: 2,
      });

      expect(markedCount).toBe(0);
    });
  });

  describe("checkRerunNeeded", () => {
    it("should detect when canonical was updated", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      // Update the canonical answer version
      await prisma.answerLibraryItem.update({
        where: { id: answer.id },
        data: { versionNumber: 2 },
      });

      const check = await checkRerunNeeded(saved.id);

      expect(check.needsReRun).toBe(true);
      expect(check.reason).toBe("canonical_updated");
      expect(check.currentCanonicalVersion).toBe(2);
      expect(check.detectedAgainstVersion).toBe(1);
    });

    it("should detect stale flag", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      // Mark as stale manually
      await markResultsAsStale({
        canonicalAnswerId: answer.id,
        newVersionNumber: 2,
      });

      const check = await checkRerunNeeded(saved.id);

      expect(check.needsReRun).toBe(true);
      expect(check.reason).toBe("stale");
    });

    it("should not require rerun when nothing changed", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const check = await checkRerunNeeded(saved.id);

      expect(check.needsReRun).toBe(false);
    });
  });

  describe("getRowConflictStatus", () => {
    it("should distinguish evidence conflict from canonical contradiction", async () => {
      // Set evidence conflict on item
      await prisma.questionnaireItem.update({
        where: { id: item.id },
        data: {
          reviewStatus: "conflict",
          conflictNote: "Documents disagree",
        },
      });

      // Add canonical contradiction
      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const status = await getRowConflictStatus(item.id);

      expect(status.hasConflict).toBe(true);
      expect(status.conflictTypes).toContain("evidence_conflict");
      expect(status.conflictTypes).toContain("canonical_contradiction");
      expect(status.evidenceConflict).not.toBeNull();
      expect(status.evidenceConflict?.note).toBe("Documents disagree");
      expect(status.canonicalContradiction).not.toBeNull();
    });

    it("should return only canonical when no evidence conflict", async () => {
      await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      const status = await getRowConflictStatus(item.id);

      expect(status.hasConflict).toBe(true);
      expect(status.conflictTypes).toEqual(["canonical_contradiction"]);
      expect(status.evidenceConflict).toBeNull();
    });

    it("should return no conflict when neither exists", async () => {
      const status = await getRowConflictStatus(item.id);

      expect(status.hasConflict).toBe(false);
      expect(status.conflictTypes).toHaveLength(0);
    });
  });

  describe("deleteContradictionResult", () => {
    it("should delete a contradiction result", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
      });

      await deleteContradictionResult(saved.id);

      const retrieved = await getContradictionResult(saved.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("canonical version pinning", () => {
    it("should preserve canonical version at detection time", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 5, // Specific version
        canonicalApprovedAt: new Date("2024-01-15"),
        canonicalGovernanceStatus: "APPROVED_FOR_EXPORT",
      });

      expect(saved.canonicalVersionNumber).toBe(5);
      expect(saved.canonicalGovernanceStatus).toBe("APPROVED_FOR_EXPORT");
      expect(saved.canonicalApprovedAt).toEqual(new Date("2024-01-15"));
    });

    it("should allow tracking rule pack version", async () => {
      const saved = await saveContradictionResult({
        workspaceId: workspace.id,
        questionnaireId: questionnaire.id,
        questionnaireItemId: item.id,
        contradictionFound: true,
        canonicalAnswerId: answer.id,
        canonicalVersionNumber: 1,
        rulePackVersion: "access_control@1.2.3",
        ruleId: "access_control_rbac_polarity",
        detectorVersion: "2.0.0",
      });

      expect(saved.rulePackVersion).toBe("access_control@1.2.3");
      expect(saved.ruleId).toBe("access_control_rbac_polarity");
      expect(saved.detectorVersion).toBe("2.0.0");
    });
  });
});
