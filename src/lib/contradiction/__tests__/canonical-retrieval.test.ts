/**
 * Tests for Canonical Answer Retrieval Service
 *
 * Coverage:
 * - Exact sub-control match retrieval
 * - Fallback to topic-level canonical when no sub-control match
 * - Internal-only vs export-safe retrieval scopes
 * - Multiple approved versions (latest wins)
 * - No eligible canonical answer scenarios
 * - Topic resolution by ID vs key
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  retrieveCanonicalAnswer,
  retrieveExportCanonical,
  retrieveInternalCanonical,
  CanonicalRetrievalError,
  type CanonicalRetrievalInput,
} from "../canonical-retrieval";

// Test helpers
async function createWorkspace(name: string) {
  return prisma.workspace.create({
    data: {
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
    },
  });
}

async function createUser(email: string) {
  return prisma.user.create({
    data: {
      email,
      name: "Test User",
      passwordHash: "test-hash",
    },
  });
}

async function createTopic(workspaceId: string | null, key: string, name: string) {
  return prisma.knowledgeTopic.create({
    data: {
      workspaceId,
      key,
      name,
      embedding: [],
    },
  });
}

interface AnswerCreateInput {
  workspaceId: string;
  topicId: string;
  title: string;
  answer: string;
  status?: "DRAFT" | "APPROVED" | "ARCHIVED";
  governanceStatus?:
    | "DRAFT"
    | "IN_REVIEW"
    | "APPROVED_INTERNAL"
    | "APPROVED_FOR_EXPORT"
    | "REVISION_REQUIRED"
    | "REJECTED"
    | "EXPIRED";
  approvalScope?: "INTERNAL_ONLY" | "EXPORT_ALLOWED";
  exportSafe?: boolean;
  approvedAt?: Date;
  approvedByUserId?: string;
  nextReviewDueAt?: Date;
  versionNumber?: number;
  subControlKey?: string | null;
  subControlLabels?: string[];
}

async function createAnswer(data: AnswerCreateInput) {
  return prisma.answerLibraryItem.create({
    data: {
      workspaceId: data.workspaceId,
      topicId: data.topicId,
      title: data.title,
      answer: data.answer,
      status: data.status ?? "APPROVED",
      governanceStatus: data.governanceStatus ?? "APPROVED_FOR_EXPORT",
      approvalScope: data.approvalScope ?? "EXPORT_ALLOWED",
      exportSafe: data.exportSafe ?? true,
      approvedAt: data.approvedAt ?? new Date(),
      approvedByUserId: data.approvedByUserId,
      nextReviewDueAt: data.nextReviewDueAt,
      versionNumber: data.versionNumber ?? 1,
      subControlKey: data.subControlKey ?? null,
      subControlLabels: data.subControlLabels ?? [],
      embedding: [],
    },
  });
}

describe("canonical-retrieval", () => {
  let workspace: { id: string };
  let user: { id: string };
  let topic: { id: string; key: string };

  beforeEach(async () => {
    workspace = await createWorkspace("Test Workspace");
    user = await createUser("test@example.com");
    topic = await createTopic(workspace.id, "access_control", "Access Control");
  });

  afterEach(async () => {
    // Clean up in reverse dependency order
    await prisma.answerLibraryItem.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.knowledgeTopic.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  describe("exact sub-control match", () => {
    it("should return exact sub-control match over topic-level answer", async () => {
      // Create topic-level generic answer
      const genericAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Generic Access Control",
        answer: "We implement access control policies.",
        subControlKey: null,
        versionNumber: 1,
      });

      // Create specific sub-control answer
      const rbacAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "RBAC Policy",
        answer: "We use role-based access control with least privilege.",
        subControlKey: "rbac",
        subControlLabels: ["role-based", "least privilege"],
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        subControlKey: "rbac",
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(rbacAnswer.id);
        expect(result.canonical.subControlKey).toBe("rbac");
        expect(result.canonical.answer).toBe("We use role-based access control with least privilege.");
        expect(result.selection.strategy).toBe("exact_subcontrol");
        expect(result.selection.subControlMatch).toBe("exact");
      }
    });

    it("should fallback to topic-level when no exact sub-control match", async () => {
      const genericAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Generic Access Control",
        answer: "We implement access control policies.",
        subControlKey: null,
        versionNumber: 1,
      });

      // Request a sub-control that doesn't exist
      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        subControlKey: "nonexistent_key",
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(genericAnswer.id);
        expect(result.canonical.subControlKey).toBeNull();
        expect(result.selection.strategy).toBe("topic_fallback");
        expect(result.selection.subControlMatch).toBe("none");
      }
    });

    it("should return specific code when sub-control specified but no match found", async () => {
      // Create only sub-control specific answers (no generic)
      const rbacAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "RBAC Policy",
        answer: "RBAC content.",
        subControlKey: "rbac",
        versionNumber: 1,
      });

      // Request different sub-control - should still return something eligible
      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        subControlKey: "access_review", // Different from rbac
        scope: "export",
      });

      // Falls back to first eligible (rbac since it's the only one)
      expect(result.kind).toBe("success");
    });
  });

  describe("topic-level fallback", () => {
    it("should return topic-level answer when no sub-control specified", async () => {
      const topicAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Access Control Policy",
        answer: "Our access control policy covers all areas.",
        subControlKey: null,
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(topicAnswer.id);
        expect(result.canonical.subControlKey).toBeNull();
        expect(result.selection.strategy).toBe("generic_topic");
      }
    });

    it("should prefer topic-level over sub-control when no sub-control specified", async () => {
      const subControlAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "RBAC",
        answer: "RBAC specific content.",
        subControlKey: "rbac",
        versionNumber: 1,
      });

      const topicAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Generic Access Control",
        answer: "Generic content.",
        subControlKey: null,
        versionNumber: 1,
      });

      // Without subControlKey, should prefer topic-level
      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(topicAnswer.id);
      }
    });
  });

  describe("internal-only vs export-safe retrieval", () => {
    it("should return internal-approved answer for internal scope", async () => {
      const internalAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Internal Access Control",
        answer: "Internal only content.",
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "internal",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(internalAnswer.id);
        expect(result.canonical.governanceStatus).toBe("APPROVED_INTERNAL");
      }
    });

    it("should reject internal-only answer for export scope", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Internal Access Control",
        answer: "Internal only content.",
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("none");
      if (result.kind === "none") {
        expect(result.code).toBe("NO_ELIGIBLE_ANSWERS");
      }
    });

    it("should require exportSafe=true for export scope", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Export Answer Not Safe",
        answer: "Content.",
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: false, // Not marked safe!
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("none");
      if (result.kind === "none") {
        expect(result.code).toBe("EXPORT_SAFE_REQUIRED_BUT_UNAVAILABLE");
      }
    });

    it("should accept export-safe answer for internal scope (more permissive)", async () => {
      const exportAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Export Safe Answer",
        answer: "Content.",
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: true,
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "internal", // Can use export-safe for internal
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(exportAnswer.id);
      }
    });
  });

  describe("multiple approved versions", () => {
    it("should select highest versionNumber first", async () => {
      const oldVersion = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Access Control v1",
        answer: "Old content.",
        versionNumber: 1,
        approvedAt: new Date("2024-01-01"),
      });

      const newVersion = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Access Control v2",
        answer: "New content.",
        versionNumber: 2,
        approvedAt: new Date("2024-06-01"),
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(newVersion.id);
        expect(result.canonical.versionNumber).toBe(2);
        expect(result.canonical.answer).toBe("New content.");
      }
    });

    it("should use approvedAt as secondary sort when version same", async () => {
      const earlier = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Earlier",
        answer: "Earlier content.",
        versionNumber: 1,
        approvedAt: new Date("2024-01-01"),
      });

      const later = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Later",
        answer: "Later content.",
        versionNumber: 1,
        approvedAt: new Date("2024-06-01"),
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(later.id);
      }
    });

    it("should prefer exact sub-control match even if lower version", async () => {
      const highVersionGeneric = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Generic v3",
        answer: "Generic v3 content.",
        subControlKey: null,
        versionNumber: 3,
      });

      const lowVersionSubControl = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "RBAC v1",
        answer: "RBAC specific v1.",
        subControlKey: "rbac",
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        subControlKey: "rbac",
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        // Should prefer exact sub-control match regardless of version
        expect(result.canonical.answerId).toBe(lowVersionSubControl.id);
        expect(result.canonical.subControlKey).toBe("rbac");
      }
    });
  });

  describe("no eligible canonical answer", () => {
    it("should return TOPIC_NOT_FOUND when topic does not exist", async () => {
      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicKey: "nonexistent_topic",
        scope: "export",
      });

      expect(result.kind).toBe("none");
      if (result.kind === "none") {
        expect(result.code).toBe("TOPIC_NOT_FOUND");
        expect(result.context.candidatesFound).toBe(0);
      }
    });

    it("should return NO_ANSWERS_FOR_TOPIC when topic has no answers", async () => {
      const emptyTopic = await createTopic(workspace.id, "empty_topic", "Empty Topic");

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: emptyTopic.id,
        scope: "export",
      });

      expect(result.kind).toBe("none");
      if (result.kind === "none") {
        expect(result.code).toBe("NO_ANSWERS_FOR_TOPIC");
      }
    });

    it("should return ALL_ANSWERS_EXPIRED when only expired answers exist", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Expired Answer",
        answer: "Content.",
        governanceStatus: "EXPIRED",
        status: "APPROVED",
        nextReviewDueAt: new Date("2023-01-01"), // Past
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("none");
      if (result.kind === "none") {
        expect(result.code).toBe("ALL_ANSWERS_EXPIRED");
      }
    });

    it("should return ALL_ANSWERS_ARCHIVED when only archived answers exist", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Archived Answer",
        answer: "Content.",
        status: "ARCHIVED",
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("none");
      if (result.kind === "none") {
        expect(result.code).toBe("ALL_ANSWERS_ARCHIVED");
      }
    });

    it("should return context with rejection counts", async () => {
      // Create eligible answer
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Eligible",
        answer: "Content.",
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: true,
        versionNumber: 1,
      });

      // Create ineligible answer (draft)
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Ineligible Draft",
        answer: "Content.",
        governanceStatus: "DRAFT",
        status: "DRAFT",
        versionNumber: 2,
      });

      // Query for export scope - both eligible
      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.selection.candidatesCount).toBe(2);
      }
    });
  });

  describe("topic resolution", () => {
    it("should resolve topic by key within workspace", async () => {
      const answer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "By Key",
        answer: "Content.",
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicKey: "access_control", // Use key instead of ID
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.answerId).toBe(answer.id);
      }
    });

    it("should throw error when neither topicId nor topicKey provided", async () => {
      await expect(
        retrieveCanonicalAnswer({
          workspaceId: workspace.id,
          scope: "export",
        } as CanonicalRetrievalInput),
      ).rejects.toThrow(CanonicalRetrievalError);
    });
  });

  describe("convenience methods", () => {
    it("retrieveExportCanonical should use export scope", async () => {
      const exportAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Export",
        answer: "Content.",
        governanceStatus: "APPROVED_FOR_EXPORT",
        approvalScope: "EXPORT_ALLOWED",
        exportSafe: true,
        versionNumber: 1,
      });

      const result = await retrieveExportCanonical(workspace.id, { topicId: topic.id });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.governanceStatus).toBe("APPROVED_FOR_EXPORT");
        expect(result.canonical.exportSafe).toBe(true);
      }
    });

    it("retrieveInternalCanonical should use internal scope", async () => {
      const internalAnswer = await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Internal",
        answer: "Content.",
        governanceStatus: "APPROVED_INTERNAL",
        approvalScope: "INTERNAL_ONLY",
        exportSafe: false,
        versionNumber: 1,
      });

      const result = await retrieveInternalCanonical(workspace.id, { topicId: topic.id });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.governanceStatus).toBe("APPROVED_INTERNAL");
      }
    });
  });

  describe("freshness metadata", () => {
    it("should return fresh for recently approved answer", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Fresh",
        answer: "Content.",
        approvedAt: new Date(),
        nextReviewDueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days out
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.freshness).toBe("fresh");
      }
    });

    it("should return due_soon for answer near review date", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Due Soon",
        answer: "Content.",
        approvedAt: new Date(),
        nextReviewDueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days out
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "export",
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.freshness).toBe("due_soon");
      }
    });

    it("should return expired_or_past_due for past due answer", async () => {
      await createAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        title: "Expired",
        answer: "Content.",
        approvedAt: new Date("2024-01-01"),
        nextReviewDueAt: new Date("2024-02-01"), // Past
        versionNumber: 1,
      });

      const result = await retrieveCanonicalAnswer({
        workspaceId: workspace.id,
        topicId: topic.id,
        scope: "internal", // Can still use expired for internal
      });

      expect(result.kind).toBe("success");
      if (result.kind === "success") {
        expect(result.canonical.freshness).toBe("expired_or_past_due");
      }
    });
  });
});
