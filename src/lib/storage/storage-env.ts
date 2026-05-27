import { z } from "zod";
import { StorageConfigError } from "./errors";

const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

const storageEnvSchema = z.object({
  STORAGE_DRIVER: z.enum(["s3", "local"]).optional().default("s3"),
  STORAGE_BUCKET: optionalString,
  STORAGE_REGION: optionalString,
  STORAGE_ENDPOINT: optionalString,
  STORAGE_ACCESS_KEY_ID: optionalString,
  STORAGE_SECRET_ACCESS_KEY: optionalString,
  STORAGE_FORCE_PATH_STYLE: z.enum(["true", "false"]).optional(),
});

export type StorageConfig = {
  driver: "s3" | "local";
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

function readRaw() {
  return {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    STORAGE_REGION: process.env.STORAGE_REGION,
    STORAGE_ENDPOINT: process.env.STORAGE_ENDPOINT,
    STORAGE_ACCESS_KEY_ID: process.env.STORAGE_ACCESS_KEY_ID,
    STORAGE_SECRET_ACCESS_KEY: process.env.STORAGE_SECRET_ACCESS_KEY,
    STORAGE_FORCE_PATH_STYLE: process.env.STORAGE_FORCE_PATH_STYLE as "true" | "false" | undefined,
  };
}

/**
 * Returns full storage config when all required variables are set; otherwise null.
 */
export function getStorageConfig(): StorageConfig | null {
  const raw = readRaw();
  const parsed = storageEnvSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const d = parsed.data;

  // If driver is local, we don't strictly require S3 credentials, 
  // but we provide defaults/placeholders to keep the type happy or use them for disk paths.
  if (d.STORAGE_DRIVER === "local") {
    return {
      driver: "local",
      bucket: d.STORAGE_BUCKET || "local-storage",
      region: d.STORAGE_REGION || "local",
      endpoint: d.STORAGE_ENDPOINT || "local",
      accessKeyId: d.STORAGE_ACCESS_KEY_ID || "local",
      secretAccessKey: d.STORAGE_SECRET_ACCESS_KEY || "local",
      forcePathStyle: true,
    };
  }

  const required = [
    d.STORAGE_BUCKET,
    d.STORAGE_REGION,
    d.STORAGE_ENDPOINT,
    d.STORAGE_ACCESS_KEY_ID,
    d.STORAGE_SECRET_ACCESS_KEY,
  ];
  if (required.some((v) => !v)) {
    return null;
  }
  return {
    driver: "s3",
    bucket: d.STORAGE_BUCKET!,
    region: d.STORAGE_REGION!,
    endpoint: d.STORAGE_ENDPOINT!,
    accessKeyId: d.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: d.STORAGE_SECRET_ACCESS_KEY!,
    forcePathStyle: d.STORAGE_FORCE_PATH_STYLE === "true",
  };
}

export function requireStorageConfig(): StorageConfig {
  const cfg = getStorageConfig();
  if (!cfg) {
    throw new StorageConfigError(
      "Set STORAGE_BUCKET, STORAGE_REGION, STORAGE_ENDPOINT, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY",
    );
  }
  return cfg;
}
