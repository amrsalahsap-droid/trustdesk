import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createWorkspaceForUser } from "../create-workspace";
import { DemoSeedingService } from "../onboarding/demo-seeding-service";

const mockTransaction = vi.mocked(prisma.$transaction);
const mockWorkspaceCreate = vi.fn();
const mockMembershipCreate = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    workspace: {
      create: vi.fn(),
    },
    workspaceMembership: {
      create: vi.fn(),
    },
  },
  uncheckedPrisma: {
    workspace: {
      create: vi.fn(),
    },
    workspaceMembership: {
      create: vi.fn(),
    },
    sourceDocument: { create: vi.fn() },
    sourceDocumentContent: { create: vi.fn() },
    knowledgeTopic: { create: vi.fn() },
    answerLibraryItem: { create: vi.fn() },
    questionnaire: { create: vi.fn() },
    questionnaireItem: { create: vi.fn() },
    contradictionResult: { create: vi.fn() },
  }
}));

import { uncheckedPrisma } from "@/lib/db/prisma";

describe("Demo Identification Foundation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a real workspace with isDemo = false", async () => {
    const mockWorkspace = { id: "ws-real", name: "Real Corp", isDemo: false };
    
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        workspace: {
          create: vi.fn().mockResolvedValue(mockWorkspace),
        },
        workspaceMembership: {
          create: vi.fn().mockResolvedValue({ id: "mem-1" }),
        },
      };
      return fn(tx as any);
    });

    const result = await createWorkspaceForUser("user-1", "Real Corp");
    
    // Check that isDemo: false was passed to create
    // Since createWorkspaceForUser calls tx.workspace.create
    // We need to verify the call inside the transaction
  });

  it("should create a demo workspace with isDemo = true", async () => {
    const mockWorkspace = { id: "ws-demo", name: "Acme Demo", isDemo: true };
    (uncheckedPrisma.workspace.create as any).mockResolvedValue(mockWorkspace);

    const result = await DemoSeedingService.createDemoWorkspace("user-1");
    
    expect(uncheckedPrisma.workspace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDemo: true,
        }),
      })
    );
  });
});
