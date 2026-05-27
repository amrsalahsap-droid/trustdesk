export { resolveUserIdentity } from "./resolve-identity";
export { resolveWorkspaceMembership } from "./resolve-membership";
export { buildAuthContext } from "./build-context";
export { authorizeRole } from "./authorize-role";

export {
  AuthenticationError,
  NoWorkspaceAccessError,
  WorkspaceAccessDeniedError,
  InsufficientRoleError,
  WorkspaceSelectionRequiredError,
  AlreadyOnboardedError,
  DuplicateEmailError,
  InvalidCredentialsError,
  UserNotFoundError,
} from "./errors";

export { getCurrentUser, type CurrentUserProfile } from "./get-current-user";
export { getPostAuthRedirectForUser } from "./post-auth-redirect";

export type { AuthIdentity, AuthContext, MembershipResolution } from "./types";
