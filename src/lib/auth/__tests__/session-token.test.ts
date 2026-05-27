import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "../session-token";

describe("session token", () => {
  it("round-trips user id", () => {
    const token = createSessionToken("user-123");
    expect(verifySessionToken(token)).toBe("user-123");
  });

  it("rejects tampered token", () => {
    const token = createSessionToken("user-123");
    const tampered = token.slice(0, -4) + "xxxx";
    expect(verifySessionToken(tampered)).toBeNull();
  });
});
