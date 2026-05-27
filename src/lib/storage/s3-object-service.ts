import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@/lib/logging/logger";
import { requireStorageConfig } from "./storage-env";
import { StorageDeleteError, StorageSignedUrlError, StorageUploadError } from "./errors";

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) {
    return client;
  }
  const cfg = requireStorageConfig();
  client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  });
  return client;
}

export function resetS3ClientForTests(): void {
  client = null;
}

export type UploadObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  contentLength: number;
  workspaceId: string;
};


export async function uploadObject(input: UploadObjectInput): Promise<void> {
  const cfg = requireStorageConfig();
  logger.info("storage:upload:start", {
    workspaceId: input.workspaceId,
    keyPrefix: input.key.slice(0, 80),
    contentLength: input.contentLength,
  });

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: input.key,
        Body: Buffer.from(input.body),
        ContentType: input.contentType,
        ContentLength: input.contentLength,
      }),
    );
    logger.info("storage:upload:success", { 
      workspaceId: input.workspaceId,
      keyPrefix: input.key.slice(0, 80) 
    });

  } catch (err) {
    logger.warn("storage:upload:failure", {
      workspaceId: input.workspaceId,
      keyPrefix: input.key.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    });

    throw new StorageUploadError();
  }
}

export async function downloadObject(workspaceId: string, key: string): Promise<Buffer> {

  const cfg = requireStorageConfig();
  try {
    const response = await getClient().send(
      new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error("Empty response body from S3");
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err) {
    logger.error("storage:download:failure", {
      workspaceId,
      keyPrefix: key.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}


export async function deleteObject(workspaceId: string, key: string): Promise<void> {

  const cfg = requireStorageConfig();
  try {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
      }),
    );
    logger.info("storage:delete:success", { 
      workspaceId,
      keyPrefix: key.slice(0, 80) 
    });

  } catch (err) {
    logger.warn("storage:delete:failure", {
      workspaceId,
      keyPrefix: key.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    });

    throw new StorageDeleteError();
  }
}

const DEFAULT_DOWNLOAD_TTL_SECONDS = 900;

export async function getSignedDownloadUrl(
  workspaceId: string,
  storageKey: string,
  expiresInSeconds: number = DEFAULT_DOWNLOAD_TTL_SECONDS,
): Promise<string> {

  const cfg = requireStorageConfig();
  try {
    const command = new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: storageKey,
    });
    const url = await getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
    return url;
  } catch (err) {
    logger.warn("storage:signed-url:failure", {
      workspaceId,
      keyPrefix: storageKey.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    });

    throw new StorageSignedUrlError();
  }
}

export async function checkStorageConnection(): Promise<void> {
  const cfg = requireStorageConfig();
  try {
    await getClient().send(
      new HeadBucketCommand({
        Bucket: cfg.bucket,
      }),
    );
    logger.info("storage:connection:ok", { bucket: cfg.bucket });
  } catch (err) {
    logger.error("storage:connection:failed", {
      bucket: cfg.bucket,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
