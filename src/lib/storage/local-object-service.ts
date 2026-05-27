import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile, unlink, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { logger } from "@/lib/logging/logger";
import { StorageDeleteError, StorageUploadError } from "./errors";

// Base directory for local storage - in the project root
const STORAGE_ROOT = join(process.cwd(), "storage");

/**
 * Ensures a directory exists for a given file path.
 */
async function ensureDir(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
}

export type UploadObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  contentLength: number;
  workspaceId: string;
};

export async function uploadObject(input: UploadObjectInput): Promise<void> {
  const filePath = join(STORAGE_ROOT, input.key);
  
  logger.info("storage:local:upload:start", {
    workspaceId: input.workspaceId,
    key: input.key,
  });

  try {
    await ensureDir(filePath);
    await writeFile(filePath, Buffer.from(input.body));
    
    logger.info("storage:local:upload:success", { 
      workspaceId: input.workspaceId,
      key: input.key 
    });
  } catch (err) {
    logger.error("storage:local:upload:failure", {
      workspaceId: input.workspaceId,
      key: input.key,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new StorageUploadError();
  }
}

export async function downloadObject(workspaceId: string, key: string): Promise<Buffer> {
  const filePath = join(STORAGE_ROOT, key);
  
  try {
    return await readFile(filePath);
  } catch (err) {
    logger.error("storage:local:download:failure", {
      workspaceId,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function deleteObject(workspaceId: string, key: string): Promise<void> {
  const filePath = join(STORAGE_ROOT, key);
  
  try {
    await unlink(filePath);
    logger.info("storage:local:delete:success", { workspaceId, key });
  } catch (err) {
    // If file doesn't exist, we don't necessarily want to crash, 
    // but the S3 service would throw an error if the key is missing in many cases.
    logger.warn("storage:local:delete:failure", {
      workspaceId,
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new StorageDeleteError();
  }
}

export async function getSignedDownloadUrl(
  workspaceId: string,
  storageKey: string,
  _expiresInSeconds?: number,
): Promise<string> {
  // For local storage, we point to our internal API route that serves these files.
  // We use the storageKey directly as the path segment.
  return `/api/storage/${storageKey}`;
}

export async function checkStorageConnection(): Promise<void> {
  try {
    await mkdir(STORAGE_ROOT, { recursive: true });
    await access(STORAGE_ROOT);
    logger.info("storage:local:connection:ok", { path: STORAGE_ROOT });
  } catch (err) {
    logger.error("storage:local:connection:failed", {
      path: STORAGE_ROOT,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
