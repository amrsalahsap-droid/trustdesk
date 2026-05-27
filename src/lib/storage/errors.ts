export class StorageConfigError extends Error {
  readonly code = "STORAGE_CONFIG" as const;

  constructor(message = "Object storage is not configured") {
    super(message);
    this.name = "StorageConfigError";
  }
}

export class StorageUploadError extends Error {
  readonly code = "STORAGE_UPLOAD" as const;

  constructor(message = "Failed to upload object to storage") {
    super(message);
    this.name = "StorageUploadError";
  }
}

export class StorageDeleteError extends Error {
  readonly code = "STORAGE_DELETE" as const;

  constructor(message = "Failed to delete object from storage") {
    super(message);
    this.name = "StorageDeleteError";
  }
}

export class InvalidFileError extends Error {
  readonly code = "INVALID_FILE" as const;

  constructor(message = "File is not allowed or failed validation") {
    super(message);
    this.name = "InvalidFileError";
  }
}

export class StorageSignedUrlError extends Error {
  readonly code = "STORAGE_SIGNED_URL" as const;

  constructor(message = "Failed to generate signed download URL") {
    super(message);
    this.name = "StorageSignedUrlError";
  }
}
