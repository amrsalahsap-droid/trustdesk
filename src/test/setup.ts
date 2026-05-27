import { vi } from "vitest";

// Intercept dynamic Node require for https-proxy-agent to avoid ESM require errors under Vitest
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'https-proxy-agent') {
    return {
      HttpsProxyAgent: class MockHttpsProxyAgent {}
    };
  }
  return originalRequire.apply(this, arguments);
};

process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/trustdesk_test";
process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? "0123456789abcdef0123456789abcdef";

// Mock the Prisma singleton — every test file that imports @/lib/db/prisma gets this mock
if (!process.env.SKIP_PRISMA_MOCK) {
  vi.mock("@/lib/db/prisma", () => {
    const client = createMockPrismaClient();
    return { prisma: client, uncheckedPrisma: client };
  });
}

// Mock next/headers so server-only calls don't blow up in Vitest
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Mock next/server with a minimal NextResponse
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => {
      const status = init?.status ?? 200;
      return {
        status,
        json: async () => body,
        _body: body,
        cookies: {
          set: vi.fn(),
          get: vi.fn(),
          delete: vi.fn(),
        },
      };
    },
  },
}));

/**
 * Factory for a lightweight mock PrismaClient.
 * Each model property returns chainable query methods (findMany, findUnique, create, etc.)
 * that default to returning empty results.  Tests override specific methods with `vi.mocked(...)`.
 */
export function createMockPrismaClient() {
  const mockModel = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    delete: vi.fn().mockResolvedValue({}),
    count: vi.fn().mockResolvedValue(0),
  });

  return {
    user: mockModel(),
    workspace: mockModel(),
    workspaceMembership: mockModel(),
    sourceDocument: mockModel(),
    auditEvent: mockModel(),
    answerLibraryItem: mockModel(),
    answerLibraryItemVersion: mockModel(),
    answerEvidence: mockModel(),
    questionnaireItem: mockModel(),
    gapFlag: mockModel(),
    knowledgeTopic: mockModel(),
    workspaceInvitation: mockModel(),
    workspaceProfile: mockModel(),
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
      const txClient = {
        workspace: mockModel(),
        workspaceMembership: mockModel(),
        user: mockModel(),
        sourceDocument: mockModel(),
        auditEvent: mockModel(),
        answerLibraryItem: mockModel(),
        answerLibraryItemVersion: mockModel(),
        answerEvidence: mockModel(),
        questionnaireItem: mockModel(),
        gapFlag: mockModel(),
        knowledgeTopic: mockModel(),
        workspaceInvitation: mockModel(),
        workspaceProfile: mockModel(),
      };
      return fn(txClient);
    }),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };
}
