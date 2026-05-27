import { requireStorageConfig } from "./storage-env";
import * as s3Provider from "./s3-object-service";
import * as localProvider from "./local-object-service";

/**
 * Dispatcher for storage operations.
 * Routes calls to either S3 or Local Filesystem based on the configured STORAGE_DRIVER.
 */

export async function uploadObject(params: {
  workspaceId: string;
  key: string;
  body: Uint8Array;
  contentType: string;
  contentLength: number;
}) {
  validateKeyScope(params.workspaceId, params.key);
  const cfg = requireStorageConfig();
  if (cfg.driver === "local") {
    return localProvider.uploadObject(params);
  }
  return s3Provider.uploadObject(params);
}

export async function downloadObject(workspaceId: string, key: string) {
  validateKeyScope(workspaceId, key);
  const cfg = requireStorageConfig();
  if (cfg.driver === "local") {
    return localProvider.downloadObject(workspaceId, key);
  }
  return s3Provider.downloadObject(workspaceId, key);
}

export async function deleteObject(workspaceId: string, key: string) {
  validateKeyScope(workspaceId, key);
  const cfg = requireStorageConfig();
  if (cfg.driver === "local") {
    return localProvider.deleteObject(workspaceId, key);
  }
  return s3Provider.deleteObject(workspaceId, key);
}

export async function getSignedDownloadUrl(
  workspaceId: string,
  storageKey: string,
  expiresInSeconds?: number,
) {
  validateKeyScope(workspaceId, storageKey);
  const cfg = requireStorageConfig();
  if (cfg.driver === "local") {
    return localProvider.getSignedDownloadUrl(workspaceId, storageKey, expiresInSeconds);
  }
  return s3Provider.getSignedDownloadUrl(workspaceId, storageKey, expiresInSeconds);
}

/**
 * Strict parity check: Every object key must be prefixed with the workspace scope.
 * Prevents "Confused Deputy" attacks where a valid workspace ID is used to access another tenant's key.
 */
function validateKeyScope(workspaceId: string, key: string) {
  if (key.startsWith("pending:")) return; // Allow global pending uploads
  const expectedPrefix = `workspaces/${workspaceId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`Tenant Security Violation: Storage key scope mismatch for workspace ${workspaceId}`);
  }
}

export async function checkStorageConnection() {
  const cfg = requireStorageConfig();
  if (cfg.driver === "local") {
    return localProvider.checkStorageConnection();
  }
  return s3Provider.checkStorageConnection();
}
