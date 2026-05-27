/**
 * Permission Guard Tests
 * 
 * Tests that API routes properly enforce permission-based access control.
 * All sensitive API routes must:
 * - Return 401 for unauthenticated requests
 * - Return 403 for authenticated but unauthorized requests
 * - Allow access only to users with the required permission
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/build-context", () => ({
  buildAuthContext: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    answerLibraryItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    sourceDocument: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    questionnaire: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { buildAuthContext } from "@/lib/auth/build-context";
import { GET as answersGet } from "@/app/api/knowledge/answers/route";
import { GET as searchGet } from "@/app/api/knowledge/search/route";
import { GET as documentsGet } from "@/app/api/documents/route";
import { GET as documentDetailGet } from "@/app/api/documents/[id]/route";
import { POST as documentsPost } from "@/app/api/documents/route";
import { POST as uploadPost } from "@/app/api/questionnaires/upload/route";
import { POST as dangerPost } from "@/app/api/workspaces/danger/route";
import { Permission } from "@/lib/auth/permissions";
import { InsufficientRoleError, AuthenticationError } from "@/lib/auth/errors";

const mockBuildContext = vi.mocked(buildAuthContext);

function makeRequest(url: string, method = "GET", headers?: HeadersInit): Request {
  return new Request(url, { method, headers });
}

function makeContext(role: string, permissions: Permission[], workspaceId = "ws-1", userId = "user-1") {
  return {
    userId,
    workspaceId,
    role: role as any,
    permissions,
    membershipId: "member-1",
    membershipStatus: "ACTIVE",
    sessionId: "session-1",
  };
}

describe("API Permission Guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("/api/knowledge/answers", () => {
    it("returns 401 for unauthenticated requests", async () => {
      mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

      const req = makeRequest("http://localhost/api/knowledge/answers");
      const res = await answersGet(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 for authenticated user without VIEW_ANSWERS permission", async () => {
      // Contributor role does NOT have VIEW_ANSWERS according to RolePermissions
      const ctx = makeContext("CONTRIBUTOR", [Permission.COMMENT, Permission.UPLOAD_EVIDENCE]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/knowledge/answers");
      const res = await answersGet(req);

      expect(res.status).toBe(403);
    });

    it("allows access for users with VIEW_ANSWERS permission", async () => {
      const ctx = makeContext("ANSWER_OWNER", [Permission.VIEW_ANSWERS, Permission.EDIT_ANSWERS]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/knowledge/answers");
      const res = await answersGet(req);

      expect(res.status).toBe(200);
    });

    it("allows access for ADMIN with all permissions", async () => {
      const ctx = makeContext("ADMIN", Object.values(Permission));
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/knowledge/answers");
      const res = await answersGet(req);

      expect(res.status).toBe(200);
    });
  });

  describe("/api/knowledge/search", () => {
    it("returns 401 for unauthenticated requests", async () => {
      mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

      const req = makeRequest("http://localhost/api/knowledge/search?q=test");
      const res = await searchGet(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 for authenticated user without VIEW_ANSWERS permission", async () => {
      const ctx = makeContext("CONTRIBUTOR", [Permission.COMMENT]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/knowledge/search?q=test");
      const res = await searchGet(req);

      expect(res.status).toBe(403);
    });

    it("allows access for users with VIEW_ANSWERS permission", async () => {
      const ctx = makeContext("OPERATOR", [Permission.VIEW_ANSWERS, Permission.IMPORT_QUESTIONNAIRES]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/knowledge/search?q=test");
      const res = await searchGet(req);

      expect(res.status).toBe(200);
    });
  });

  describe("/api/documents", () => {
    describe("GET (list documents)", () => {
      it("returns 401 for unauthenticated requests", async () => {
        mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

        const req = makeRequest("http://localhost/api/documents");
        const res = await documentsGet(req);

        expect(res.status).toBe(401);
      });

      it("returns 403 for authenticated user without VIEW_EVIDENCE permission", async () => {
        // APPROVER role does NOT have VIEW_EVIDENCE according to RolePermissions
        const ctx = makeContext("APPROVER", [Permission.APPROVE_ANSWERS, Permission.VIEW_ANSWERS]);
        mockBuildContext.mockResolvedValueOnce(ctx);

        const req = makeRequest("http://localhost/api/documents");
        const res = await documentsGet(req);

        expect(res.status).toBe(403);
      });

      it("allows access for users with VIEW_EVIDENCE permission", async () => {
        const ctx = makeContext("ANSWER_OWNER", [Permission.VIEW_ANSWERS, Permission.VIEW_EVIDENCE, Permission.EDIT_ANSWERS]);
        mockBuildContext.mockResolvedValueOnce(ctx);

        const req = makeRequest("http://localhost/api/documents");
        const res = await documentsGet(req);

        expect(res.status).toBe(200);
      });
    });

    describe("POST (upload documents)", () => {
      it("returns 401 for unauthenticated requests", async () => {
        mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

        const formData = new FormData();
        const req = makeRequest("http://localhost/api/documents", "POST");
        req.headers.set("Content-Type", "multipart/form-data");
        const res = await documentsPost(req);

        expect(res.status).toBe(401);
      });

      it("returns 403 for authenticated user without UPLOAD_EVIDENCE permission", async () => {
        // APPROVER role does NOT have UPLOAD_EVIDENCE
        const ctx = makeContext("APPROVER", [Permission.APPROVE_ANSWERS, Permission.VIEW_ANSWERS]);
        mockBuildContext.mockResolvedValueOnce(ctx);

        const req = makeRequest("http://localhost/api/documents", "POST");
        const res = await documentsPost(req);

        expect(res.status).toBe(403);
      });

      it("allows access for users with UPLOAD_EVIDENCE permission", async () => {
        const ctx = makeContext("CONTRIBUTOR", [Permission.VIEW_ANSWERS, Permission.UPLOAD_EVIDENCE, Permission.COMMENT]);
        mockBuildContext.mockResolvedValueOnce(ctx);

        const req = makeRequest("http://localhost/api/documents", "POST");
        const res = await documentsPost(req);

        // Will fail validation due to missing file, but permission check passed
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      });
    });
  });

  describe("/api/documents/[id]", () => {
    it("returns 401 for unauthenticated requests", async () => {
      mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

      const req = makeRequest("http://localhost/api/documents/doc-1");
      const res = await documentDetailGet(req, { params: Promise.resolve({ id: "doc-1" }) });

      expect(res.status).toBe(401);
    });

    it("returns 403 for authenticated user without VIEW_EVIDENCE permission", async () => {
      const ctx = makeContext("AUDITOR", [Permission.VIEW_ANSWERS, Permission.VIEW_AUDIT]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/documents/doc-1");
      const res = await documentDetailGet(req, { params: Promise.resolve({ id: "doc-1" }) });

      expect(res.status).toBe(403);
    });

    it("allows access for users with VIEW_EVIDENCE permission", async () => {
      const ctx = makeContext("ANSWER_OWNER", [Permission.VIEW_ANSWERS, Permission.VIEW_EVIDENCE, Permission.EDIT_ANSWERS]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/documents/doc-1");
      const res = await documentDetailGet(req, { params: Promise.resolve({ id: "doc-1" }) });

      // May return 404 if document not found, but permission check passed
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("/api/questionnaires/upload", () => {
    it("returns 401 for unauthenticated requests", async () => {
      mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

      const req = makeRequest("http://localhost/api/questionnaires/upload", "POST");
      const res = await uploadPost(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 for authenticated user without IMPORT_QUESTIONNAIRES permission", async () => {
      // ANSWER_OWNER does NOT have IMPORT_QUESTIONNAIRES
      const ctx = makeContext("ANSWER_OWNER", [Permission.VIEW_ANSWERS, Permission.EDIT_ANSWERS]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/questionnaires/upload", "POST");
      const res = await uploadPost(req);

      expect(res.status).toBe(403);
    });

    it("allows access for users with IMPORT_QUESTIONNAIRES permission", async () => {
      const ctx = makeContext("OPERATOR", [Permission.VIEW_ANSWERS, Permission.IMPORT_QUESTIONNAIRES]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/questionnaires/upload", "POST");
      const res = await uploadPost(req);

      // Will fail validation due to missing file, but permission check passed
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("/api/workspaces/danger", () => {
    it("returns 401 for unauthenticated requests", async () => {
      mockBuildContext.mockRejectedValueOnce(new AuthenticationError());

      const req = makeRequest("http://localhost/api/workspaces/danger", "POST");
      const res = await dangerPost(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 for authenticated user without MANAGE_SETTINGS permission", async () => {
      // OPERATOR does NOT have MANAGE_SETTINGS
      const ctx = makeContext("OPERATOR", [Permission.VIEW_ANSWERS, Permission.IMPORT_QUESTIONNAIRES]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/workspaces/danger", "POST");
      const res = await dangerPost(req);

      expect(res.status).toBe(403);
    });

    it("allows access for users with MANAGE_SETTINGS permission", async () => {
      const ctx = makeContext("ADMIN", Object.values(Permission));
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/workspaces/danger", "POST");
      const res = await dangerPost(req);

      // Will fail validation due to missing body, but permission check passed
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("allows access for OWNER with MANAGE_SETTINGS permission", async () => {
      const ctx = makeContext("OWNER", Object.values(Permission));
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/workspaces/danger", "POST");
      const res = await dangerPost(req);

      // Will fail validation due to missing body, but permission check passed
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe("Permission Matrix Validation", () => {
    it("validates that AUDITOR cannot access document upload", async () => {
      const ctx = makeContext("AUDITOR", [Permission.VIEW_ANSWERS, Permission.VIEW_AUDIT]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/documents", "POST");
      const res = await documentsPost(req);

      expect(res.status).toBe(403);
    });

    it("validates that CONTRIBUTOR can upload evidence", async () => {
      const ctx = makeContext("CONTRIBUTOR", [Permission.UPLOAD_EVIDENCE, Permission.VIEW_ANSWERS]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/documents", "POST");
      const res = await documentsPost(req);

      // Not 403 means permission check passed
      expect(res.status).not.toBe(403);
    });

    it("validates that APPROVER cannot upload questionnaires", async () => {
      const ctx = makeContext("APPROVER", [Permission.APPROVE_ANSWERS, Permission.VIEW_ANSWERS]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/questionnaires/upload", "POST");
      const res = await uploadPost(req);

      expect(res.status).toBe(403);
    });

    it("validates that OPERATOR can upload questionnaires", async () => {
      const ctx = makeContext("OPERATOR", [Permission.IMPORT_QUESTIONNAIRES, Permission.VIEW_ANSWERS]);
      mockBuildContext.mockResolvedValueOnce(ctx);

      const req = makeRequest("http://localhost/api/questionnaires/upload", "POST");
      const res = await uploadPost(req);

      // Not 403 means permission check passed
      expect(res.status).not.toBe(403);
    });
  });
});
