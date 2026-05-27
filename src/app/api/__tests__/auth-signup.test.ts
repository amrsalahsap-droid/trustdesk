import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/modules/users/sign-up", () => ({
  signUpUser: vi.fn(),
}));

import { signUpUser } from "@/modules/users/sign-up";
import { POST } from "@/app/api/auth/signup/route";

const mockSignUp = vi.mocked(signUpUser);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeJsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  it("returns 201 with user and next, and sets session cookie", async () => {
    mockSignUp.mockResolvedValue({
      user: { id: "u1", email: "a@b.com", name: "A" },
      next: "/onboarding",
    });

    const res = await POST(
      makeJsonRequest({ name: "A", email: "a@b.com", password: "StrongPass123" }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toEqual({
      user: { id: "u1", email: "a@b.com", name: "A" },
      next: "/onboarding",
    });
    expect(res.cookies.set).toHaveBeenCalled();
  });
});
