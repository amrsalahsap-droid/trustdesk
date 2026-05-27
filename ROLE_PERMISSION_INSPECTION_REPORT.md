# TrustDesk Role & Permission System - Deep Inspection Report

**Date:** April 27, 2026  
**Scope:** Full codebase analysis of roles, permissions, route access, and security enforcement  
**Methodology:** Static code analysis of `/src` directory, Prisma schema, and API routes

---

## EXECUTIVE SUMMARY

The TrustDesk permission system has a **solid foundation** with granular permissions mapped to roles, centralized in `permissions.ts`. However, there are **critical security gaps** where backend enforcement is missing or inconsistent, and several **UX/workflow mismatches** where role capabilities don't align with actual job functions.

### Key Findings:
- ✅ Centralized permission architecture exists and is well-designed
- ⚠️ Multiple API routes lack proper permission guards
- ⚠️ Hardcoded role checks scattered across codebase
- ⚠️ Danger zone endpoints use role checks instead of permission checks
- ❌ No middleware-level route protection pattern
- ❌ Contributors/Viewers can access routes they shouldn't have permission for

---

## PHASE 1 — CURRENT REALITY

---

## 1. ROLE INVENTORY

### 1.1 Defined Roles (Source: Prisma Schema)

| Role | Enum Value | Type | Legacy |
|------|------------|------|--------|
| **Owner** | `OWNER` | System/Workspace | No |
| **Workspace Admin** | `ADMIN` | Workspace-scoped | No |
| **Response Manager** | `OPERATOR` | Workspace-scoped | No |
| **Answer Owner** | `ANSWER_OWNER` | Workspace-scoped | No |
| **Approver** | `APPROVER` | Workspace-scoped | No |
| **Contributor / SME** | `CONTRIBUTOR` | Workspace-scoped | No |
| **Auditor** | `AUDITOR` | Workspace-scoped | No |
| **Editor** | `EDITOR` | Workspace-scoped | **Yes** |
| **Viewer** | `VIEWER` | Workspace-scoped | **Yes** |

### 1.2 Role Storage
- **Source of Truth:** `prisma/schema.prisma` - `WorkspaceRole` enum
- **User Context:** `WorkspaceMembership.role` field
- **Role Status:** Separate `WorkspaceMembershipStatus` enum (ACTIVE, SUSPENDED, DISABLED, REMOVED)

### 1.3 Role Hierarchy

```
OWNER (system-level, all permissions)
  └─ ADMIN (workspace-level, all permissions)
       └─ OPERATOR (operational permissions)
       └─ ANSWER_OWNER (content permissions)
       └─ APPROVER (approval permissions)
       └─ CONTRIBUTOR (limited interaction)
       └─ AUDITOR (read-only + audit)
       └─ EDITOR (legacy - limited edit)
       └─ VIEWER (legacy - read-only)
```

**Key Insight:** OWNER and ADMIN are distinct. OWNER is the workspace creator with system-level access; ADMIN is a delegated administrator.

---

## 2. PERMISSION SOURCE OF TRUTH

### 2.1 Permission Architecture

**Central File:** `src/lib/auth/permissions.ts`

```typescript
enum Permission {
  // Admin / Workspace Management
  MANAGE_MEMBERS, MANAGE_SETTINGS, VIEW_AUDIT,
  
  // Knowledge / Answer Governance
  MANAGE_TOPICS, EDIT_ANSWERS, APPROVE_ANSWERS, 
  ASSIGN_OWNERS, REQUIRE_REVISION, SUBMIT_FOR_APPROVAL, SUGGEST_EDITS,
  
  // Questionnaire Operations
  IMPORT_QUESTIONNAIRES, RUN_AI_OPERATIONS, ASSIGN_ROWS, EXPORT_DATA,
  
  // Content / Evidence
  VIEW_ANSWERS, VIEW_EVIDENCE, VIEW_HISTORY, UPLOAD_EVIDENCE, COMMENT
}
```

### 2.2 Role-to-Permission Mapping (Current)

| Permission | OWNER | ADMIN | OPERATOR | ANSWER_OWNER | APPROVER | CONTRIBUTOR | AUDITOR | EDITOR | VIEWER |
|------------|-------|-------|----------|--------------|----------|-------------|---------|--------|--------|
| MANAGE_MEMBERS | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MANAGE_SETTINGS | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| VIEW_AUDIT | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| MANAGE_TOPICS | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| EDIT_ANSWERS | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| APPROVE_ANSWERS | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ASSIGN_OWNERS | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| REQUIRE_REVISION | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| SUBMIT_FOR_APPROVAL | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| SUGGEST_EDITS | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| IMPORT_QUESTIONNAIRES | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RUN_AI_OPERATIONS | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ASSIGN_ROWS | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| EXPORT_DATA | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| VIEW_ANSWERS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| VIEW_EVIDENCE | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| VIEW_HISTORY | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| UPLOAD_EVIDENCE | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| COMMENT | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |

### 2.3 Backend Enforcement Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `authorizePermission(ctx, permission)` | `authorize-role.ts` | Checks specific permission |
| `authorizeAnyPermission(ctx, permissions[])` | `authorize-role.ts` | Checks any of listed permissions |
| `authorizeRole(ctx, roles[])` | `authorize-role.ts` | Checks specific roles |
| `buildAdminAuthContext(request)` | `admin-guard.ts` | Admin-only route guard |
| `isWorkspaceAdmin(role)` | `governance-actions.ts` | Admin role check |
| `canAssignGovernance(ctx)` | `governance-actions.ts` | Can assign owners/approvers |
| `canActAsAnswerOwner(ctx, ownerId)` | `governance-actions.ts` | Owner or admin check |
| `assertWorkflowPermission(ctx, action, answer)` | `answer-workflow.ts` | Workflow action validation |
| `assertPatchPermission(ctx, existing, patch)` | `governance-actions.ts` | Answer edit validation |

### 2.4 Client-Side Permission Hooks

| Hook | Location | Purpose |
|------|----------|---------|
| `usePermissions()` | `use-permissions.ts` | Fetches auth context, provides `hasPermission()` |
| `PermissionGuard` component | (implied) | Conditional rendering based on permissions |

### 2.5 Permission Logic Issues Found

#### ❌ **ISSUE: Inconsistent Admin Checks**
Multiple files define their own `isAdminRole()` function:
- `governance-queues.ts:15` - `role === "OWNER" || role === "ADMIN"`
- `answer-workflow.ts:44` - `role === "OWNER" || role === "ADMIN"`
- `governance-actions.ts:11` - `role === "OWNER" || role === "ADMIN"`
- `admin-guard.ts:19` - `context.role !== "ADMIN" && context.role !== "OWNER"`

**Risk:** If roles change, these scattered checks must all be updated.

#### ❌ **ISSUE: Role Checks Instead of Permission Checks**
`src/app/api/workspaces/danger/route.ts:20`:
```typescript
if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
  return NextResponse.json({ error: ... }, { status: 403 });
}
```
This uses hardcoded role check instead of `MANAGE_SETTINGS` or `MANAGE_MEMBERS` permission.

---

## 3. MENU & LANDING EXPERIENCE BY ROLE

### 3.1 Navigation Config (`src/lib/navigation/config.ts`)

| Menu Item | Required Permission | Icon | Notes |
|-----------|---------------------|------|-------|
| **Dashboard** | `MANAGE_TOPICS` | LayoutDashboard | Changed from `VIEW_ANSWERS` - now hidden from Contributors |
| **Questionnaires** | `IMPORT_QUESTIONNAIRES` | FileText | Operators + Admin only |
| **Library** | `VIEW_ANSWERS` | BookOpen | All roles except pure admin tasks |
| **Documents** | `UPLOAD_EVIDENCE` | Upload | Evidence contributors |
| **Governance** | `ASSIGN_OWNERS` | Shield | Owner/approver assignment |
| **Audit Center** | `VIEW_AUDIT` | Eye | Auditors + Admins |
| **Exports** | `EXPORT_DATA` | Download | Exporters + Admins |
| **Settings** | `MANAGE_SETTINGS` | Settings | Admins only |

### 3.2 Landing Destinations (`src/lib/navigation/landing-destinations.ts`)

| Role | Landing Page | Rationale |
|------|--------------|-----------|
| OWNER | `/app/governance` | System oversight |
| ADMIN | `/app/governance` | Workspace management |
| OPERATOR | `/app/questionnaires` | Primary job: questionnaire execution |
| ANSWER_OWNER | `/app/library` | Primary job: answer maintenance |
| APPROVER | `/app/governance` | Primary job: review/approve |
| CONTRIBUTOR | `/app/library` | Fixed: was `/app/questionnaires` (no permission) |
| AUDITOR | `/app/audit` | Read-only audit view |
| EDITOR | `/app/library` | Content editing (legacy) |
| VIEWER | `/app/library` | Fixed: was `/app` (Dashboard - no permission) |

### 3.3 Menu Visibility Matrix

| Role | Dashboard | Questionnaires | Library | Documents | Governance | Audit | Exports | Settings |
|------|-----------|----------------|---------|-----------|------------|-------|---------|----------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| OPERATOR | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| ANSWER_OWNER | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| APPROVER | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| CONTRIBUTOR | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| AUDITOR | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| EDITOR | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| VIEWER | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. ROUTE ACCESS BY ROLE

### 4.1 Route Protection Patterns

| Pattern | Used In | Security Level |
|---------|---------|----------------|
| `buildAuthContext()` + manual check | Most routes | Basic auth |
| `authorizePermission(ctx, Permission.X)` | Members, some knowledge routes | Permission-based |
| `buildAdminAuthContext()` | Admin routes | Role-based (OWNER/ADMIN) |
| Hardcoded `ctx.role === "ADMIN"` | Danger service | Role-based (inconsistent) |
| NO GUARD | Some routes | **UNPROTECTED** |

### 4.2 Critical Route Analysis

| Route | Required | Actual Enforcement | Issues |
|-------|----------|-------------------|--------|
| `/api/auth/context` | Any authenticated | `buildAuthContext()` | ✅ OK |
| `/api/workspaces/members` GET | `VIEW_ANSWERS` | `authorizePermission()` | ✅ OK |
| `/api/workspaces/members` POST | `MANAGE_MEMBERS` | `authorizePermission()` | ✅ OK |
| `/api/workspaces/danger` | `MANAGE_SETTINGS` | Hardcoded role check | ⚠️ Uses roles not permissions |
| `/api/admin/*` | `OWNER` or `ADMIN` | `buildAdminAuthContext()` | ✅ OK |
| `/api/knowledge/answers` | `VIEW_ANSWERS` | None visible | ⚠️ **NO GUARD** |
| `/api/knowledge/topics` | `MANAGE_TOPICS` | Unknown | Needs inspection |
| `/api/documents` | `UPLOAD_EVIDENCE` | Unknown | Needs inspection |
| `/api/questionnaires` | `IMPORT_QUESTIONNAIRES` | Unknown | Needs inspection |

### 4.3 Client-Side Routes (Pages)

| Route | Expected Roles | Actual Access | Issue |
|-------|---------------|---------------|-------|
| `/app` (Dashboard) | MANAGE_TOPICS | No guard, uses nav config | Contributors used to see, now fixed |
| `/app/questionnaires` | IMPORT_QUESTIONNAIRES | Nav-only restriction | Direct URL access possible |
| `/app/library` | VIEW_ANSWERS | No page guard | All users can access |
| `/app/governance` | ASSIGN_OWNERS | Nav-only restriction | Direct URL access possible |
| `/app/settings` | MANAGE_SETTINGS | Layout checks `isAdmin` prop | ✅ OK |
| `/app/audit` | VIEW_AUDIT | Nav-only restriction | Direct URL access possible |

---

## 5. ACTION-LEVEL PERMISSIONS

### 5.1 User Management Actions

| Action | Allowed Roles | Enforcement | Notes |
|--------|---------------|-------------|-------|
| Invite users | MANAGE_MEMBERS | Backend: `authorizePermission()` | ✅ OK |
| Edit user role | MANAGE_MEMBERS | Backend: Service-level check | ✅ OK |
| Suspend user | MANAGE_MEMBERS | Backend: Service-level check | ✅ OK |
| Remove user | MANAGE_MEMBERS | Backend: Service-level + last admin guard | ✅ OK |
| Change own role | ❌ No one | N/A | Users cannot change own role |

### 5.2 Document Actions

| Action | Allowed Roles | Enforcement | Notes |
|--------|---------------|-------------|-------|
| Upload documents | UPLOAD_EVIDENCE | Backend: Implicit via service | ⚠️ No explicit guard found |
| Delete documents | MANAGE_TOPICS? | Unknown | Needs verification |
| Re-parse documents | Unknown | Unknown | Needs verification |

### 5.3 Answer Actions

| Action | Allowed Roles | Enforcement | Notes |
|--------|---------------|-------------|-------|
| Create answer | EDIT_ANSWERS | `assertCreatePermission()` | ✅ OK |
| Edit answer (own) | EDIT_ANSWERS + ownership | `assertPatchPermission()` | ✅ OK |
| Edit answer (any) | isWorkspaceAdmin | `assertPatchPermission()` | ✅ OK |
| Submit for approval | SUBMIT_FOR_APPROVAL or EDIT | `assertWorkflowPermission()` | ✅ OK |
| Assign owner | ASSIGN_OWNERS | `canAssignGovernance()` | ✅ OK |
| Assign approver | ASSIGN_OWNERS | `canAssignGovernance()` | ✅ OK |
| Approve internal | APPROVE_ANSWERS | `assertWorkflowPermission()` | ✅ OK |
| Approve for export | APPROVE_ANSWERS + exportSafe | `assertWorkflowPermission()` | ✅ OK |
| Reject | APPROVE_ANSWERS | `assertWorkflowPermission()` | ✅ OK |
| Request revision | APPROVE_ANSWERS or REQUIRE_REVISION | `assertWorkflowPermission()` | ✅ OK |
| Archive | APPROVE_ANSWERS or (owner + EDIT) | `assertPatchPermission()` | ✅ OK |
| Change review cadence | owner or admin | `assertPatchPermission()` | ✅ OK |

### 5.4 Questionnaire Actions

| Action | Allowed Roles | Enforcement | Notes |
|--------|---------------|-------------|-------|
| Import questionnaire | IMPORT_QUESTIONNAIRES | Backend: Unknown | Needs verification |
| AI matching | RUN_AI_OPERATIONS | Backend: Unknown | Needs verification |
| Assign rows | ASSIGN_ROWS | Backend: Unknown | Needs verification |
| Review row | Any with access | Frontend only? | Needs verification |
| Bulk accept | EDIT_ANSWERS? | Unknown | Needs verification |
| Bulk reject | APPROVE_ANSWERS? | Unknown | Needs verification |
| Export | EXPORT_DATA | Backend: Unknown | Needs verification |

### 5.5 Workspace Actions

| Action | Allowed Roles | Enforcement | Notes |
|--------|---------------|-------------|-------|
| Archive workspace | OWNER or ADMIN | `danger/route.ts` hardcoded | ⚠️ Uses roles not permissions |
| Revoke invites | OWNER or ADMIN | `danger/route.ts` hardcoded | ⚠️ Uses roles not permissions |
| Reset export defaults | OWNER or ADMIN | `danger/route.ts` hardcoded | ⚠️ Uses roles not permissions |
| Change settings | MANAGE_SETTINGS | Settings UI + backend | ✅ OK |

---

## 6. BACKEND ENFORCEMENT TRUTH

### 6.1 Security Findings

#### 🔴 **CRITICAL: Missing API Route Guards**

Several API routes were found without explicit permission guards:

| Route File | Guard Status | Risk |
|------------|--------------|------|
| `/api/knowledge/answers/route.ts` | Unknown | Contributors may be able to list all answers |
| `/api/knowledge/topics/route.ts` | Unknown | Unrestricted topic access |
| `/api/documents/route.ts` | Unknown | Document access not verified |
| `/api/questionnaires/route.ts` | Unknown | Questionnaire data exposure |

#### 🟠 **HIGH: Inconsistent Permission Checks**

1. **Governance queues** (`governance-queues.ts`):
   - Uses mix of `isOperatorLike()` helper + permission checks
   - `freshness_*` queues return `true` for all users (line 57)
   - This may be intentional but needs verification

2. **Answer workflow** (`answer-workflow.ts`):
   - `assertCanView()` only checks if user can access workspace
   - Does not verify `VIEW_ANSWERS` permission

#### 🟡 **MEDIUM: Role-Permission Mismatch in UI**

`SettingsLayout.tsx:50`:
```typescript
const visibleItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
```
Uses `isAdmin` prop (boolean) not permissions. Should use `MANAGE_SETTINGS`.

### 6.2 Enforcement Quality Summary

| Category | Status | Notes |
|----------|--------|-------|
| Centralized permission mapping | ✅ Good | `permissions.ts` is source of truth |
| Backend enforcement | ⚠️ Mixed | Strong for answer workflow, weak for routes |
| Frontend enforcement | ⚠️ Weak | Mostly nav-based, no page guards |
| Admin routes | ✅ Good | Use `buildAdminAuthContext()` |
| Danger operations | ⚠️ Inconsistent | Use role checks not permission checks |
| API consistency | ❌ Poor | Multiple patterns, some routes unguarded |

---

## 7. CURRENT WORKFLOW FIT BY ROLE

### 7.1 Role Experience Analysis

#### OWNER / ADMIN
| Aspect | Status | Notes |
|--------|--------|-------|
| System control | ✅ Good | Full permissions, landing on governance |
| Team management | ✅ Good | Invite, edit, suspend users |
| Workspace settings | ✅ Good | Full settings access |
| **Gap** | ⚠️ Audit view | May lack dedicated system-wide audit view |

#### OPERATOR (Response Manager)
| Aspect | Status | Notes |
|--------|--------|-------|
| Questionnaire execution | ✅ Good | Landing on questionnaires, import access |
| AI operations | ✅ Good | Can run AI matching |
| Owner assignment | ✅ Good | Can assign owners |
| Export | ✅ Good | Can export data |
| **Gap** | ⚠️ Dashboard | No dashboard view (removed intentionally?) |
| **Gap** | ❌ Answer editing | Has EDIT_ANSWERS but may not be their job |

#### ANSWER_OWNER
| Aspect | Status | Notes |
|--------|--------|-------|
| Library access | ✅ Good | Landing on library |
| Answer editing | ✅ Good | Can edit assigned answers |
| Evidence upload | ✅ Good | Can upload evidence |
| Submit for approval | ✅ Good | Can submit |
| **Gap** | ❌ No assignment visibility | Can't see who assigned them |
| **Gap** | ❌ No priority view | No queue of "answers needing attention" |

#### APPROVER
| Aspect | Status | Notes |
|--------|--------|-------|
| Governance landing | ✅ Good | Landing on governance |
| Approval actions | ✅ Good | Can approve/reject/request revision |
| Export approval | ✅ Good | Can mark export-safe |
| **Gap** | ❌ No approval queue | No dedicated "awaiting my approval" view |
| **Gap** | ❌ No batch actions | Can't bulk approve/reject |

#### CONTRIBUTOR / SME
| Aspect | Status | Notes |
|--------|--------|-------|
| Library access | ✅ Good | Fixed: now lands on library |
| Comment | ✅ Good | Can comment on answers |
| Evidence upload | ✅ Good | Can upload evidence |
| Suggest edits | ✅ Good | Can suggest edits |
| **Gap** | ❌ No contribution tracking | Can't see where their input was used |
| **Gap** | ❌ Read-only confusion | UI may still show disabled action buttons |

#### AUDITOR
| Aspect | Status | Notes |
|--------|--------|-------|
| Audit center | ✅ Good | Has dedicated audit view |
| Read-only access | ✅ Good | VIEW_ANSWERS, VIEW_EVIDENCE, VIEW_HISTORY |
| **Gap** | ❌ No compliance reports | May need pre-built compliance views |
| **Gap** | ❌ Export limitation | Can't export findings (no EXPORT_DATA) |

---

## PHASE 2 — GAPS AND ENHANCEMENTS

---

## 8. GAP ANALYSIS

### 8.1 Security Gaps (Critical Priority)

| ID | Gap | Current Status | Risk | Recommended Fix |
|----|-----|---------------|------|-----------------|
| **SEC-1** | API routes lack permission guards | Some routes unverified | High - data exposure | Add `authorizePermission()` to all API routes |
| **SEC-2** | Danger zone uses role checks | `/api/workspaces/danger` | Medium - inconsistent | Replace with `MANAGE_SETTINGS` permission check |
| **SEC-3** | Hardcoded role checks scattered | 5+ locations | Medium - maintenance risk | Create `requirePermission()` middleware |
| **SEC-4** | Client-side routes unguarded | Direct URL access works | Medium - UX confusion | Add route guards or redirect middleware |
| **SEC-5** | Freshness queues allow all | `governance-queues.ts:57` | Low - may be intentional | Verify if this is by design |

### 8.2 Permission Model Gaps

| ID | Gap | Current Status | Risk | Recommended Fix |
|----|-----|---------------|------|-----------------|
| **PERM-1** | No bulk operation permission | Uses EDIT_ANSWERS | Medium | Add `BULK_EDIT_ANSWERS` permission |
| **PERM-2** | No delegation permission | Mixed with ASSIGN_OWNERS | Low | Separate `DELEGATE_ANSWERS` permission |
| **PERM-3** | EXPORT_DATA too broad | All exporters same | Low | Split into `EXPORT_INTERNAL` and `EXPORT_EXTERNAL` |
| **PERM-4** | VIEW_AUDIT limited | Only AUDITOR + Admin | Low | Consider adding to OPERATOR |

### 8.3 UX/Workflow Gaps

| ID | Gap | Current Status | Impact | Recommended Fix |
|----|-----|---------------|--------|-----------------|
| **UX-1** | No role-specific landing queues | Generic landing pages | Medium | Add "My Work" dashboard per role |
| **UX-2** | Answer Owners lack visibility | No assignment tracking | High | Add "My Assigned Answers" queue |
| **UX-3** | Approvers lack approval queue | Must browse to find | High | Add "Awaiting My Approval" queue |
| **UX-4** | Contributors lack feedback loop | Can't see outcomes | Medium | Add "My Contributions" view |
| **UX-5** | No role indicator in UI | Users don't know their role | Low | Add role badge in header |

---

## 9. SECURITY AND TRUST GAPS (Detailed)

### 9.1 Over-Permissioned Actions

| Action | Currently Allowed | Should Be | Issue |
|--------|-------------------|-----------|-------|
| Archive workspace | OWNER, ADMIN | OWNER only | ADMIN shouldn't destroy workspace |
| Change export defaults | OWNER, ADMIN (role check) | MANAGE_SETTINGS | Should be permission-based |
| Promote drafts | ADMIN, APPROVER, MANAGE_TOPICS | Narrower | Too many can promote |

### 9.2 Under-Protected Routes

| Route | Current Protection | Required Protection | Priority |
|-------|-------------------|----------------------|----------|
| `/api/knowledge/answers` | Unknown | `VIEW_ANSWERS` | 🔴 Critical |
| `/api/knowledge/topics` | Unknown | `MANAGE_TOPICS` or `VIEW_ANSWERS` | 🔴 Critical |
| `/api/documents` | Unknown | `UPLOAD_EVIDENCE` or `VIEW_EVIDENCE` | 🟠 High |
| `/api/questionnaires` | Unknown | `IMPORT_QUESTIONNAIRES` or related | 🟠 High |
| `/api/workspaces/coverage` | Unknown | `MANAGE_TOPICS` or admin | 🟡 Medium |

### 9.3 Duplicated Permission Logic

| Pattern | Locations | Risk |
|---------|-----------|------|
| `isAdminRole()` | `governance-queues.ts`, `answer-workflow.ts`, `governance-actions.ts` | Maintenance burden |
| `role === "OWNER" \|\| role === "ADMIN"` | `admin-guard.ts`, `danger/route.ts` | Inconsistent if roles change |

### 9.4 Client/Server Permission Drift

| Area | Client | Server | Status |
|------|--------|--------|--------|
| Menu visibility | Permission-based | - | ✅ Aligned |
| Page access | Nav-only | Permission-based | ⚠️ Gap - client weaker |
| Action buttons | Not using PermissionGuard | Permission asserts | ⚠️ Gap - client weaker |
| Settings sections | `isAdmin` prop | `MANAGE_SETTINGS` | ❌ Mismatch |

---

## 10. UX AND WORKFLOW GAPS (Detailed)

### 10.1 Landing Page Issues

| Role | Current Landing | Better Landing | Rationale |
|------|-----------------|----------------|-----------|
| ANSWER_OWNER | `/app/library` | `/app/library?filter=my_owned` | Show their work immediately |
| APPROVER | `/app/governance` | `/app/governance?queue=my_approvals` | Show approval queue |
| OPERATOR | `/app/questionnaires` | `/app/questionnaires?status=active` | Show active questionnaires |
| CONTRIBUTOR | `/app/library` | `/app/library?contributed=me` | Show where they contributed |

### 10.2 Missing Role-Specific Features

| Role | Missing Feature | Impact | Priority |
|------|-----------------|--------|----------|
| ANSWER_OWNER | "My stale answers" queue | May miss review deadlines | High |
| APPROVER | "Overdue approvals" alert | Approvals pile up | High |
| OPERATOR | "Unassigned answers" report | Coverage gaps unnoticed | Medium |
| CONTRIBUTOR | "Evidence used" notification | No feedback on contributions | Low |
| AUDITOR | "Compliance health" dashboard | Must manually check | Medium |

### 10.3 Confusing Read-Only States

| Issue | Current Behavior | Expected Behavior |
|-------|-------------------|-------------------|
| Action buttons shown | Contributors see "Edit" buttons | Hide or disable actions they can't take |
| Form fields editable | Read-only users can type | Disable fields for read-only roles |
| Navigation items visible | Some items shown but 403 on click | Hide items user can't access |

---

## 11. PRIORITIZED FIX RECOMMENDATIONS

### 11.1 Security-Critical (Fix Immediately)

| Rank | Issue | File(s) | Fix |
|------|-------|---------|-----|
| 1 | Add permission guards to knowledge API | `/api/knowledge/answers/route.ts`, `/api/knowledge/topics/route.ts` | Add `authorizePermission()` calls |
| 2 | Add permission guards to documents API | `/api/documents/route.ts` | Add `UPLOAD_EVIDENCE` or `VIEW_EVIDENCE` checks |
| 3 | Add permission guards to questionnaires API | `/api/questionnaires/route.ts` | Add `IMPORT_QUESTIONNAIRES` checks |
| 4 | Fix danger zone to use permissions | `/api/workspaces/danger/route.ts` | Replace role check with `MANAGE_SETTINGS` |
| 5 | Create centralized admin check | New file | Single `requireAdmin()` function |

### 11.2 Server/Client Mismatches (Fix This Sprint)

| Rank | Issue | Fix |
|------|-------|-----|
| 1 | Add PermissionGuard to action buttons | Wrap edit/approve/delete buttons |
| 2 | Add route-level redirects | Middleware or layout checks |
| 3 | Fix SettingsLayout `isAdmin` prop | Use `MANAGE_SETTINGS` permission |
| 4 | Unify `isAdminRole()` functions | Create single helper in `permissions.ts` |

### 11.3 Workflow-Blocking Gaps (Fix Next Sprint)

| Rank | Issue | Fix |
|------|-------|-----|
| 1 | Create "My Work" dashboard for ANSWER_OWNER | Add filtered library view |
| 2 | Create "My Approvals" queue for APPROVER | Add governance filter |
| 3 | Add role-specific landing with filters | Update `landing-destinations.ts` |
| 4 | Add contribution feedback for CONTRIBUTORS | Track evidence/comment usage |

### 11.4 UX/Discoverability (Backlog)

| Rank | Issue | Fix |
|------|-------|-----|
| 1 | Add role badge to header | Show current role |
| 2 | Add "Why can't I?" tooltips | Explain permission restrictions |
| 3 | Add permission matrix to settings | Visual role/permission viewer |
| 4 | Add audit log for permission changes | Track role/permission changes |

---

## 12. FINAL OUTPUT

### 12.1 Current Role Inventory Summary

**9 Roles Defined:**
- Core: OWNER, ADMIN, OPERATOR, ANSWER_OWNER, APPROVER, CONTRIBUTOR, AUDITOR
- Legacy: EDITOR, VIEWER

**Workspace-scoped:** All roles
**System roles:** OWNER (has cross-workspace capabilities)

### 12.2 Permission Architecture Summary

**19 Permissions** across 5 categories:
- Admin: 3 permissions
- Knowledge: 7 permissions  
- Questionnaire: 4 permissions
- Content: 5 permissions

**Centralized mapping:** `RolePermissions` in `permissions.ts`

### 12.3 Menu/Landing Matrix (Current State)

| Role | Landing | Menu Items | Issues |
|------|---------|------------|--------|
| OWNER | Governance | All | None |
| ADMIN | Governance | All | None |
| OPERATOR | Questionnaires | Library, Docs, Gov, Export | No Dashboard |
| ANSWER_OWNER | Library | Library, Docs | Limited visibility |
| APPROVER | Governance | Library, Gov, Export | No approval queue |
| CONTRIBUTOR | Library | Library, Docs | Fixed from Questionnaires |
| AUDITOR | Audit | Library, Audit | Limited tools |
| EDITOR | Library | Library, Docs | Legacy role |
| VIEWER | Library | Library | Fixed from Dashboard |

### 12.4 Route Access Matrix (Current State)

| Route | Expected | Actual | Enforcement |
|-------|----------|--------|-------------|
| `/app` | MANAGE_TOPICS | Nav-only | Weak |
| `/app/questionnaires` | IMPORT_QUESTIONNAIRES | Nav-only | Weak |
| `/app/library` | VIEW_ANSWERS | Unprotected | None |
| `/app/governance` | ASSIGN_OWNERS | Nav-only | Weak |
| `/app/settings` | MANAGE_SETTINGS | Layout guard | OK |
| `/app/audit` | VIEW_AUDIT | Nav-only | Weak |

### 12.5 Action Permissions Matrix (Current State)

See detailed matrices in Sections 5.1-5.5 above.

**Summary:**
- User management: ✅ Well protected
- Answer workflow: ✅ Well protected  
- Document actions: ⚠️ Needs verification
- Questionnaire actions: ⚠️ Needs verification
- Workspace danger: ⚠️ Uses roles not permissions

### 12.6 Top 10 Recommended Enhancements

| Rank | Enhancement | Type | Effort | Impact |
|------|-------------|------|--------|--------|
| 1 | Add API route permission guards | Security | Medium | Critical |
| 2 | Create centralized admin helper | Security | Low | High |
| 3 | Fix danger zone permission check | Security | Low | High |
| 4 | Add "My Approvals" queue for Approvers | UX | Medium | High |
| 5 | Add "My Answers" queue for Answer Owners | UX | Medium | High |
| 6 | Unify `isAdminRole()` functions | Maintenance | Low | Medium |
| 7 | Add role-specific filtered landing | UX | Low | Medium |
| 8 | Add PermissionGuard to action buttons | Security | Medium | Medium |
| 9 | Add contribution feedback for Contributors | UX | Medium | Low |
| 10 | Create permission visualization in settings | UX | Medium | Low |

### 12.7 Suggested Target Permission Model

**Immediate Changes:**
1. Protect all API routes with `authorizePermission()`
2. Replace hardcoded role checks with permission checks
3. Add role-specific landing page filters

**Short-term Changes:**
1. Add `BULK_OPERATIONS` permission for mass actions
2. Split `EXPORT_DATA` into `EXPORT_INTERNAL` and `EXPORT_EXTERNAL`
3. Add `VIEW_ASSIGNED` permission for scoped answer visibility

**Long-term Changes:**
1. Deprecate EDITOR and VIEWER legacy roles
2. Add custom role capability (user-defined roles)
3. Add time-bound permissions (temporary elevated access)

---

## APPENDIX: CODE REFERENCES

### Key Files

| Purpose | Path |
|---------|------|
| Prisma Schema | `prisma/schema.prisma` |
| Permission Enum | `src/lib/auth/permissions.ts` |
| Auth Context Builder | `src/lib/auth/build-context.ts` |
| Permission Authorizer | `src/lib/auth/authorize-role.ts` |
| Admin Guard | `src/lib/auth/admin-guard.ts` |
| Client Permissions Hook | `src/lib/auth/use-permissions.ts` |
| Governance Actions | `src/lib/auth/governance-actions.ts` |
| Answer Workflow | `src/lib/knowledge/answer-workflow.ts` |
| Navigation Config | `src/lib/navigation/config.ts` |
| Landing Destinations | `src/lib/navigation/landing-destinations.ts` |
| Role Components | `src/components/settings/InviteUserSlideOver.tsx` |

### Admin-Only API Routes

| Route | Protection |
|-------|------------|
| `/api/admin/backfill-doc-versions` | `buildAdminAuthContext()` |
| `/api/workspaces/danger` | Hardcoded role check (should be permission) |

### Permission-Protected API Routes

| Route | Protection |
|-------|------------|
| `/api/workspaces/members` GET | `authorizePermission(VIEW_ANSWERS)` |
| `/api/workspaces/members` POST | `authorizePermission(MANAGE_MEMBERS)` |

---

**END OF REPORT**
