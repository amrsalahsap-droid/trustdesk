import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorageConfig, requireStorageConfig } from "../storage-env";
import { StorageConfigError } from "../errors";

const keys = [
  "STORAGE_BUCKET",
  "STORAGE_REGION",
  "STORAGE_ENDPOINT",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
] as const;

function clearStorageEnv() {
  for (const k of keys) {
    delete process.env[k];
  }
  delete process.env.STORAGE_FORCE_PATH_STYLE;
  delete process.env.STORAGE_PUBLIC_BASE_URL;
}

describe("storage env", () => {
  beforeEach(() => {
    clearStorageEnv();
  });

  afterEach(() => {
    clearStorageEnv();
  });

  it("returns null when storage is not fully configured", () => {
    process.env.STORAGE_BUCKET = "b";
    expect(getStorageConfig()).toBeNull();
  });

  it("returns config when all required vars are set", () => {
    process.env.STORAGE_BUCKET = "my-bucket";
    process.env.STORAGE_REGION = "auto";
    process.env.STORAGE_ENDPOINT = "https://example.com";
    process.env.STORAGE_ACCESS_KEY_ID = "keyid";
    process.env.STORAGE_SECRET_ACCESS_KEY = "secret";

    const cfg = getStorageConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.bucket).toBe("my-bucket");
    expect(cfg!.forcePathStyle).toBe(false);
  });

  it("requireStorageConfig throws when incomplete", () => {
    expect(() => requireStorageConfig()).toThrow(StorageConfigError);
  });
});
