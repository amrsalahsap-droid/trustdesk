import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "../get-current-user";
import * as session from "../session";

vi.mock("../session", () => ({
  getServerSession: vi.fn(),
}));

const mockGetServerSession = vi.mocked(session.getServerSession);
const mockFindUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when there is no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns profile when session and user exist", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } });
    mockFindUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
    } as never);

    await expect(getCurrentUser()).resolves.toEqual({
      id: "u1",
      email: "a@b.com",
      name: "A",
    });
  });
});
