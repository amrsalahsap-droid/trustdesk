import { describe, it, expect } from "vitest";
import { InsufficientRoleError } from "@/lib/auth/errors";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";
import { InvalidFileError, StorageConfigError } from "@/lib/storage/errors";
import { handleApiError, getApiErrorMessageFromBody } from "../error-handler";

describe("handleApiError", () => {
  it("returns 403 with INSUFFICIENT_ROLE for InsufficientRoleError", async () => {
    const res = handleApiError(new InsufficientRoleError());
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("returns 404 with RESOURCE_NOT_FOUND for ScopedResourceNotFoundError", async () => {
    const res = handleApiError(new ScopedResourceNotFoundError());
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns 400 for InvalidFileError", async () => {
    const res = handleApiError(new InvalidFileError("bad"));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("INVALID_FILE");
  });

  it("returns 503 for StorageConfigError", async () => {
    const res = handleApiError(new StorageConfigError());
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.error.code).toBe("STORAGE_CONFIG");
  });
});

describe("getApiErrorMessageFromBody", () => {
  it("reads legacy string error", () => {
    expect(getApiErrorMessageFromBody({ error: "Not found" })).toBe("Not found");
  });

  it("reads nested handleApiError shape", async () => {
    const res = handleApiError(new InsufficientRoleError());
    const body = await res.json();
    expect(getApiErrorMessageFromBody(body)).toBe("This action requires a different role");
  });
});
