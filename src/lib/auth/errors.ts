export class AuthenticationError extends Error {
  readonly code = "UNAUTHENTICATED" as const;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class NoWorkspaceAccessError extends Error {
  readonly code = "NO_WORKSPACE_ACCESS" as const;

  constructor(message = "User has no active workspace memberships") {
    super(message);
    this.name = "NoWorkspaceAccessError";
  }
}

export class WorkspaceAccessDeniedError extends Error {
  readonly code = "WORKSPACE_ACCESS_DENIED" as const;

  constructor(message = "Access to the requested workspace is denied") {
    super(message);
    this.name = "WorkspaceAccessDeniedError";
  }
}

export class MembershipSuspendedError extends Error {
  readonly code = "MEMBERSHIP_SUSPENDED" as const;

  constructor(message = "Your membership in this workspace has been suspended") {
    super(message);
    this.name = "MembershipSuspendedError";
  }
}

export class InsufficientRoleError extends Error {
  readonly code = "INSUFFICIENT_ROLE" as const;

  constructor(message = "This action requires a different role") {
    super(message);
    this.name = "InsufficientRoleError";
  }
}

export class WorkspaceSelectionRequiredError extends Error {
  readonly code = "WORKSPACE_SELECTION_REQUIRED" as const;
  readonly workspaceIds: string[];

  constructor(workspaceIds: string[]) {
    super("User belongs to multiple workspaces; explicit selection required");
    this.name = "WorkspaceSelectionRequiredError";
    this.workspaceIds = workspaceIds;
  }
}

export class AlreadyOnboardedError extends Error {
  readonly code = "ALREADY_ONBOARDED" as const;
  readonly workspaceId?: string;
  readonly workspaceName?: string;
  readonly isProfileComplete?: boolean;

  constructor(
    message = "User has already completed onboarding",
    metadata?: { workspaceId?: string; workspaceName?: string; isProfileComplete?: boolean },
  ) {
    super(message);
    this.name = "AlreadyOnboardedError";
    this.workspaceId = metadata?.workspaceId;
    this.workspaceName = metadata?.workspaceName;
    this.isProfileComplete = metadata?.isProfileComplete;
  }
}

export class DuplicateEmailError extends Error {
  readonly code = "DUPLICATE_EMAIL" as const;

  constructor(message = "An account with this email already exists") {
    super(message);
    this.name = "DuplicateEmailError";
  }
}

export class InvalidCredentialsError extends Error {
  readonly code = "INVALID_CREDENTIALS" as const;

  constructor(message = "Invalid email or password") {
    super(message);
    this.name = "InvalidCredentialsError";
  }
}

export class UserNotFoundError extends Error {
  readonly code = "USER_NOT_FOUND" as const;

  constructor(message = "User not found") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export class WorkspaceProfileIncompleteError extends Error {
  readonly code = "WORKSPACE_PROFILE_INCOMPLETE" as const;
  readonly workspaceId: string;

  constructor(workspaceId: string) {
    super("Workspace profile is incomplete and requires setup");
    this.name = "WorkspaceProfileIncompleteError";
    this.workspaceId = workspaceId;
  }
}
