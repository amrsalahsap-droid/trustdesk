import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildAdminAuthContext } from "@/lib/auth/admin-guard";
import { 
  AuthenticationError, 
  InsufficientRoleError,
  NoWorkspaceAccessError 
} from "@/lib/auth/errors";
import { GET as getBackfill } from "@/app/api/admin/backfill-doc-versions/route";
import { GET as getHealth } from "@/app/api/admin/integrations/health/route";

// Mock the admin guard
vi.mock("@/lib/auth/admin-guard", () => ({
  buildAdminAuthContext: vi.fn(),
}));

// Mock the dependencies of the routes that might trigger side effects
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sourceDocument: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const mockAdminGuard = vi.mocked(buildAdminAuthContext);

function makeRequest(url: string): Request {
  return new Request(url);
}

describe("Admin Route Security Guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const adminRoutes = [
    { name: "Backfill Doc Versions", handler: getBackfill, url: "http://localhost/api/admin/backfill-doc-versions" },
    { name: "Integrations Health", handler: getHealth, url: "http://localhost/api/admin/integrations/health" },
  ];

  adminRoutes.forEach((route) => {
    describe(route.name, () => {
      it("denies unauthenticated requests with 401", async () => {
        mockAdminGuard.mockRejectedValue(new AuthenticationError());
        
        const res = await route.handler(makeRequest(route.url));
        const body = await res.json();
        
        expect(res.status).toBe(401);
        expect(body.error.code).toBe("UNAUTHENTICATED");
        expect(mockAdminGuard).toHaveBeenCalled();
      });

      it("denies unauthorized (non-admin) requests with 403", async () => {
        mockAdminGuard.mockRejectedValue(new InsufficientRoleError("Admin access required"));
        
        const res = await route.handler(makeRequest(route.url));
        const body = await res.json();
        
        expect(res.status).toBe(403);
        expect(body.error.code).toBe("INSUFFICIENT_ROLE");
      });

      it("denies access if no workspace membership exists (403)", async () => {
        mockAdminGuard.mockRejectedValue(new NoWorkspaceAccessError());
        
        const res = await route.handler(makeRequest(route.url));
        const body = await res.json();
        
        expect(res.status).toBe(403);
        expect(body.error.code).toBe("NO_WORKSPACE_ACCESS");
      });

      it("allows authorized admin/owner requests (200)", async () => {
        mockAdminGuard.mockResolvedValue({
          userId: "admin-1",
          workspaceId: "ws-1",
          membershipId: "mem-1",
          role: "ADMIN",
        });

        const res = await route.handler(makeRequest(route.url));
        // We just care that it didn't return a 401/403
        expect(res.status).toBe(200);
      });
    });
  });
});
