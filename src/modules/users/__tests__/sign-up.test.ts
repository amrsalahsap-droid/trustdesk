import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { signUpUser } from "../sign-up";
import { DuplicateEmailError } from "@/lib/auth/errors";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);
const mockAuditCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signUpUser", () => {
  it("creates user with hashed password and returns onboarding when no workspace", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "new-user",
      email: "amr@example.com",
      name: "Amr",
    } as never);

    const result = await signUpUser({
      name: "Amr",
      email: "amr@example.com",
      password: "StrongPass123",
    });

    expect(result.user.email).toBe("amr@example.com");
    expect(result.next).toBe("/onboarding");
    expect(bcrypt.hash).toHaveBeenCalledWith("StrongPass123", 12);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        email: "amr@example.com",
        name: "Amr",
        passwordHash: "hashed-password",
      },
      select: { id: true, email: true, name: true },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "new-user",
        eventType: "USER_SIGNED_UP",
        objectType: "User",
        objectId: "new-user",
        workspaceId: null,
      }),
    });
  });

  it("normalizes email to lowercase", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "u1",
      email: "test@x.com",
      name: null,
    } as never);

    await signUpUser({ email: "Test@X.com", password: "password12" });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "test@x.com" }),
      }),
    );
  });

  it("returns /app when user already has an ACTIVE workspace membership", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "u1",
      email: "member@example.com",
      name: null,
    } as never);
    vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue({ id: "mem-1" } as never);

    const result = await signUpUser({
      email: "member@example.com",
      password: "password12",
    });

    expect(result.next).toBe("/app");
  });

  it("throws DuplicateEmailError when email exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "existing" } as never);

    await expect(
      signUpUser({ email: "dup@example.com", password: "password12" }),
    ).rejects.toThrow(DuplicateEmailError);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects weak password", async () => {
    await expect(
      signUpUser({ email: "a@b.com", password: "short" }),
    ).rejects.toThrow();
  });

  it("throws DuplicateEmailError on unique constraint race (P2002)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const err = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { modelName: "User", target: ["email"] },
    });
    mockCreate.mockRejectedValue(err);

    await expect(
      signUpUser({ email: "race@example.com", password: "password12" }),
    ).rejects.toThrow(DuplicateEmailError);
  });

  it("defaults next to /onboarding when redirect resolution fails", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "u1",
      email: "ok@example.com",
      name: null,
    } as never);
    vi.mocked(prisma.workspaceMembership.findFirst).mockRejectedValue(new Error("db down"));

    const result = await signUpUser({ email: "ok@example.com", password: "password12" });

    expect(result.next).toBe("/onboarding");
  });
});
