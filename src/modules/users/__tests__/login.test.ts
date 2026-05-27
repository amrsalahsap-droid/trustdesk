import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/db/prisma";
import { loginUser } from "../login";
import { InvalidCredentialsError } from "@/lib/auth/errors";

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

const mockFindUnique = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
});

describe("loginUser", () => {
  it("returns user and next path on valid credentials", async () => {
    mockFindUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: "A",
      passwordHash: "stored-hash",
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.workspaceMembership.findFirst).mockResolvedValue(null);

    const result = await loginUser({ email: "A@B.com", password: "secret1234" });

    expect(result.user.email).toBe("a@b.com");
    expect(result.next).toBe("/onboarding");
    expect(bcrypt.compare).toHaveBeenCalledWith("secret1234", "stored-hash");
  });

  it("throws when user not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(loginUser({ email: "x@y.com", password: "secret1234" })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("throws when password does not match", async () => {
    mockFindUnique.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      name: null,
      passwordHash: "stored-hash",
    } as never);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(loginUser({ email: "a@b.com", password: "wrong" })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });
});
