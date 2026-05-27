import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  AuthenticationError,
  NoWorkspaceAccessError,
  WorkspaceAccessDeniedError,
  InsufficientRoleError,
  WorkspaceSelectionRequiredError,
  AlreadyOnboardedError,
  DuplicateEmailError,
  InvalidCredentialsError,
  UserNotFoundError,
  MembershipSuspendedError,
} from "@/lib/auth/errors";
import { ScopedResourceNotFoundError } from "@/lib/domain/scoped-resource-not-found";
import {
  InvalidFileError,
  StorageConfigError,
  StorageDeleteError,
  StorageSignedUrlError,
  StorageUploadError,
} from "@/lib/storage/errors";
import { QuestionnaireExportError } from "@/modules/questionnaires/errors";
import { QuestionnaireMatchingError } from "@/modules/workspaces/intelligence/questionnaire-matching-errors";
import { logger } from "@/lib/logging/logger";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    workspaceIds?: string[];
    workspaceId?: string;
    workspaceName?: string;
    isProfileComplete?: boolean;
  };
}

/** Normalize API JSON error bodies from {@link handleApiError} or legacy `{ error: string }` routes. */
export function getApiErrorMessageFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  const err = (body as { error?: unknown }).error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Request failed";
}

export function handleApiError(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 401 },
    );
  }

  if (error instanceof NoWorkspaceAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 403 },
    );
  }

  if (error instanceof WorkspaceAccessDeniedError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 403 },
    );
  }

  if (error instanceof InsufficientRoleError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 403 },
    );
  }

  if (error instanceof MembershipSuspendedError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 403 },
    );
  }

  if (error instanceof WorkspaceSelectionRequiredError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          workspaceIds: error.workspaceIds,
        },
      },
      { status: 409 },
    );
  }

  if (error instanceof AlreadyOnboardedError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          workspaceId: error.workspaceId,
          workspaceName: error.workspaceName,
          isProfileComplete: error.isProfileComplete,
        },
      },
      { status: 409 },
    );
  }

  if (error instanceof DuplicateEmailError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }

  if (error instanceof InvalidCredentialsError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 401 },
    );
  }

  if (error instanceof UserNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }

  if (error instanceof QuestionnaireExportError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof QuestionnaireMatchingError) {
    return NextResponse.json(
      { error: { code: "MATCHING_FAILED", message: error.message } },
      { status: 422 },
    );
  }

  if (error instanceof ScopedResourceNotFoundError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }

  // Handle AI Errors from FailClosedProvider or other AI providers
  if (error && typeof error === "object" && (error as any).name === "AiError") {
    const aiErr = error as any;
    return NextResponse.json(
      {
        error: {
          code: aiErr.code || "AI_ERROR",
          message: aiErr.message,
        },
      },
      { status: aiErr.status || 503 },
    );
  }

  // Handle UnresolvedConflictsError from TrustProfileService
  if (error && typeof error === "object" && (error as any).name === "UnresolvedConflictsError") {
    const confErr = error as any;
    return NextResponse.json(
      {
        error: {
          code: "UNRESOLVED_CONFLICTS",
          message: confErr.message,
          unresolvedFields: confErr.unresolvedFields,
          unresolvedFieldDetails: confErr.unresolvedFieldDetails,
        },
      },
      { status: 409 },
    );
  }

  if (error instanceof InvalidFileError) {

    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 400 },
    );
  }

  if (error instanceof StorageConfigError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 503 },
    );
  }

  if (
    error instanceof StorageUploadError ||
    error instanceof StorageDeleteError ||
    error instanceof StorageSignedUrlError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: 503 },
    );
  }

  // Handle Prisma connection/initialization errors
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1000", "P1001", "P1002", "P1003", "P1008", "P1011", "P1017"].includes(error.code))
  ) {
    logger.error("api:database-connection-error", {
      error: error.message,
      code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    });

    return NextResponse.json(
      {
        error: {
          code: "DATABASE_CONNECTION_ERROR",
          message:
            "Could not connect to the database. Please ensure the database server is running and credentials are correct.",
        },
      },
      { status: 503 },
    );
  }

  // Handle Prisma constraint violations
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2025"].includes(error.code)
  ) {
    logger.warn("api:database-constraint-violation", {
      code: error.code,
      message: error.message,
      meta: error.meta,
    });

    return NextResponse.json(
      {
        error: {
          code: "DATABASE_CONSTRAINT_VIOLATION",
          message:
            "Data integrity violation. This may happen if the session refers to non-existent data or duplicates a unique record.",
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof Error && error.message === "CSRF_VALIDATION_FAILED") {
    return NextResponse.json(
      { error: { code: "CSRF_ERROR", message: "Security validation failed. Please refresh the page and try again." } },
      { status: 403 },
    );
  }

  if (error instanceof Error && error.message === "RATE_LIMIT_EXCEEDED") {
    return NextResponse.json(
      { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many attempts. Please try again later." } },
      { status: 429 },
    );
  }

  // Handle MultiTenantScopingError from tenant-extension.ts
  if (error instanceof Error && error.name === "MultiTenantScopingError") {
    logger.error("api:multi-tenant-scoping-violation", {
      error: error.message,
      stack: error.stack,
    });
    return NextResponse.json(
      {
        error: {
          code: "MULTI_TENANT_SCOPING_ERROR",
          message: "Internal security guardrail violation: cross-tenant access prevented.",
        },
      },
      { status: 500 },
    );
  }

  logger.error("api:unhandled-error", {
    error: error instanceof Error ? error.message : String(error),
  });
  console.error("DEBUG: handleApiError caught:", error);

  return NextResponse.json(
    { 
      error: { 
        code: "INTERNAL_ERROR", 
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      } 
    },
    { status: 500 },
  );
}
