import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { signUpUser } from "../sign-up";
import { DuplicateEmailError } from "@/lib/auth/errors";
import { getPostAuthRedirectForUser } from "@/lib/auth/post-auth-redirect";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
    compare: vi.fn(),
  },
}));

vi.mock("@/lib/auth/post-auth-redirect", () => ({
  getPostAuthRedirectForUser: vi.fn(),
}));

const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);
const mockAuditCreate = vi.mocked(prisma.auditEvent.create);

beforeEach(() => {
  vi.clearAllMocks();
});

const mockRequest = {
  headers: {
    get: (name: string) => (name === "x-trustdesk-csrf" ? "1" : null),
  },
} as unknown as Request;

describe("signUpUser", () => {
  it("creates user with hashed password and returns onboarding when no workspace", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "new-user",
      email: "amr@example.com",
      name: "Amr",
    } as never);
    vi.mocked(getPostAuthRedirectForUser).mockResolvedValue("/onboarding");

    const result = await signUpUser({
      name: "Amr",
      email: "amr@example.com",
      password: "StrongPass123!",
    }, mockRequest);

    expect(result.user.email).toBe("amr@example.com");
    expect(result.next).toBe("/onboarding");
    expect(bcrypt.hash).toHaveBeenCalledWith("StrongPass123!", 12);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        email: "amr@example.com",
        name: "Amr",
        passwordHash: "hashed-password",
        verificationTokenHash: expect.any(String),
        verificationExpiresAt: expect.any(Date),
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
    vi.mocked(getPostAuthRedirectForUser).mockResolvedValue("/onboarding");

    await signUpUser({ email: "Test@X.com", password: "StrongPass123!" }, mockRequest);

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
    vi.mocked(getPostAuthRedirectForUser).mockResolvedValue("/app");

    const result = await signUpUser({
      email: "member@example.com",
      password: "StrongPass123!",
    }, mockRequest);

    expect(result.next).toBe("/app");
  });

  it("throws DuplicateEmailError when email exists", async () => {
    mockFindUnique.mockResolvedValue({ id: "existing" } as never);

    await expect(
      signUpUser({ email: "dup@example.com", password: "StrongPass123!" }, mockRequest),
    ).rejects.toThrow(DuplicateEmailError);

    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects weak password", async () => {
    // Too short
    await expect(
      signUpUser({ email: "a@b.com", password: "Sh1!" }, mockRequest),
    ).rejects.toThrow();

    // Missing uppercase
    await expect(
      signUpUser({ email: "a@b.com", password: "strong123!" }, mockRequest),
    ).rejects.toThrow();

    // Missing lowercase
    await expect(
      signUpUser({ email: "a@b.com", password: "STRONG123!" }, mockRequest),
    ).rejects.toThrow();

    // Missing digit
    await expect(
      signUpUser({ email: "a@b.com", password: "StrongPass!" }, mockRequest),
    ).rejects.toThrow();

    // Missing special character
    await expect(
      signUpUser({ email: "a@b.com", password: "StrongPass123" }, mockRequest),
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
      signUpUser({ email: "race@example.com", password: "StrongPass123!" }, mockRequest),
    ).rejects.toThrow(DuplicateEmailError);
  });

  it("defaults next to /onboarding when redirect resolution fails", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: "u1",
      email: "ok@example.com",
      name: null,
    } as never);
    vi.mocked(getPostAuthRedirectForUser).mockRejectedValue(new Error("db down"));

    const result = await signUpUser({ email: "ok@example.com", password: "StrongPass123!" }, mockRequest);

    expect(result.next).toBe("/onboarding");
  });
});
