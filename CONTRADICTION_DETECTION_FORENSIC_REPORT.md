# TrustDesk Contradiction Detection Epic — Forensic Inspection Report
**Date:** April 29, 2026  
**Scope:** Deep analysis of current state vs. required state for contradiction detection  
**Status:** COMPLETE — Ready for build planning

---

## 1. Executive Summary

### Current State
**Contradiction detection is NOT currently implemented.** The "conflict" status in the codebase refers to **evidence-level conflicts** during website onboarding analysis (when multiple source documents disagree), NOT contradictions between questionnaire row answers and approved canonical answers.

### What Exists vs. What's Missing
| Component | Status | Notes |
|-----------|--------|-------|
| Canonical answer storage | ✅ Implemented | `AnswerLibraryItem` with governance states |
| Row answer storage | ✅ Implemented | `QuestionnaireItem` with suggestion linking |
| Topic/sub-control mapping | ✅ Implemented | Both models link to `KnowledgeTopic` |
| "Conflict" status field | ✅ Exists but unused | Only set during onboarding evidence analysis |
| Contradiction detection engine | ❌ Missing | No comparison logic between row ↔ canonical |
| Rule pack infrastructure | ⚠️ Partial | Sub-control taxonomy exists, no rule engine |
| Contradiction persistence | ⚠️ Partial | `conflictNote` field exists, no structured storage |
| Contradiction banner UI | ⚠️ Reusable | Existing conflict UI can be repurposed |
| Contradiction audit | ❌ Missing | No audit event types for contradictions |

### Key Insight
The data model foundations are **strong and ready**. The gap is entirely in:
1. Detection engine (comparing row answers to canonical truth)
2. Rule definition system (topic-specific contradiction rules)
3. Persistence layer for contradiction results
4. Audit integration for contradiction resolution

---

## 2. Canonical Answer Truth

### Source of Truth
```
Table: AnswerLibraryItem
Primary identifier: id (cuid)
Governance fields:
  - status: AnswerStatus (DRAFT | APPROVED | ARCHIVED)
  - governanceStatus: AnswerGovernanceStatus
      DRAFT | IN_REVIEW | APPROVED_INTERNAL | APPROVED_FOR_EXPORT |
      REVISION_REQUIRED | REJECTED | EXPIRED | ARCHIVED
  - approvalScope: AnswerApprovalScope (INTERNAL_ONLY | EXPORT_ALLOWED)
  - exportSafe: Boolean (default false)
  - approvedAt: DateTime
  - approvedByUserId: String (foreign key to User)
Content fields:
  - title: String
  - answer: String (Text) — the canonical answer text
  - version: String (default "v1")
  - versionNumber: Int (default 1)
Linkages:
  - topicId → KnowledgeTopic (nullable)
  - subControlKey: String (nullable) — e.g., "rbac", "access_review"
  - subControlLabels: String[] — keywords for matching
```

### Approval/Version Model
- **Versioning**: Full versioning via `AnswerLibraryItemVersion` table
- **Latest approved retrieval**: Filter by `governanceStatus = APPROVED_FOR_EXPORT` or `APPROVED_INTERNAL`, order by `approvedAt DESC` or `versionNumber DESC`
- **Approval scope**: `INTERNAL_ONLY` (internal reuse) vs `EXPORT_ALLOWED` (external sharing)
- **Export safety**: Separate `exportSafe` boolean requires explicit confirmation

### Readiness for Contradiction Comparison
✅ **READY** — The model supports:
- Retrieving latest approved answer by topic/sub-control
- Text comparison (full `answer` field available)
- Governance state checking (is answer approved for use?)
- Version tracking (if canonical answer changes, contradictions may need re-evaluation)

---

## 3. Questionnaire Row Truth

### Source of Truth
```
Table: QuestionnaireItem
Primary identifier: id (cuid)
Question fields:
  - question: String (Text) — the question text from spreadsheet
  - type: String (default "question_row") — distinguishes headers/notes
Answer fields:
  - suggestedAnswer: String (Text) — AI-suggested answer
  - finalAnswer: String (Text) — user-confirmed answer
  - suggestedAnswerId: String (FK to AnswerLibraryItem, nullable)
Review state:
  - reviewed: Boolean (default false)
  - verificationStatus: VerificationStatus
      DRAFTED | SUGGESTED | NEEDS_REVIEW | ACCEPTED | AUTO_ACCEPTED |
      AMBIGUOUS_MATCH | REJECTED | UNRESOLVED | UNREVIEWED | EDITED | MANUAL_OVERRIDE
  - reviewStatus: String (default "ok") — "ok" | "missing" | "conflict" ⚠️
  - conflictNote: String (nullable) — ⚠️ currently unused for canonical contradictions
Linkages:
  - topicId → KnowledgeTopic (nullable)
  - topicKey: String (nullable) — e.g., "access_control"
  - topicName: String (nullable) — display name
  - questionnaireId → Questionnaire
Override tracking:
  - overrideReasonCategory: OverrideReasonCategory
  - overrideComment: String (Text)
  - overrideScope: OverrideScope (QUESTIONNAIRE_ONLY | REQUEST_CANONICAL_UPDATE)
  - overrideAt: DateTime
  - overrideByUserId: String (FK to User)
```

### State/Provenance Model
- **Provenance**: Stored in `provenanceJson` field with structure:
  ```typescript
  {
    answerOrigin: "approved_reuse" | "subcontrol_synthesis" | "evidence_derived" | "unresolved",
    sourceAnswerIds?: string[],
    sourceSubControlKeys?: string[],
    synthesisUsed?: boolean,
    verifierVerdict?: "pass" | "fail" | null
  }
  ```
- **Ambiguity**: `isAmbiguous` boolean + `ambiguityJson` for competing topics/sub-controls
- **Unresolved reasons**: `unresolvedReason` field with categories like "no_evidence", "low_confidence", etc.

### Readiness for Contradiction Comparison
✅ **READY** — The model supports:
- Access to both suggested and final answer text
- Link to canonical answer via `suggestedAnswerId`
- Topic/sub-control linkage for determining which canonical answer to compare against
- Override tracking (already captures when user deviates from suggestion)
- ⚠️ **Gap**: `reviewStatus = "conflict"` and `conflictNote` exist but are currently only used for evidence conflicts during onboarding, NOT for canonical answer contradictions

---

## 4. Topic/Sub-Control Linkage

### Current Mapping Model

**KnowledgeTopic** (taxonomy anchor):
```
id, key (unique string), name, description, embedding[]
workspaceId (null = global/system topic)
```

**AnswerLibraryItem** (canonical answers):
```
topicId → KnowledgeTopic.id (nullable)
subControlKey: String (nullable) — matches key in taxonomy
subControlLabels: String[] — keywords for retrieval boosting
```

**QuestionnaireItem** (row answers):
```
topicId → KnowledgeTopic.id (nullable)
topicKey: String (nullable) — matches KnowledgeTopic.key
topicName: String (nullable) — display name
```

### Sub-Control Taxonomy
Defined in `@/modules/knowledge/topics/subcontrol-taxonomy.ts`:

| Topic Key | Sub-Controls | Ready for Contradiction? |
|-----------|--------------|---------------------------|
| `access_control` | 7 (rbac, access_request, access_approval, access_review, offboarding, privileged_access, admin_mfa) | ✅ Yes — well-defined |
| `incident_response` | 4 (triage, containment, communication, post_mortem) | ✅ Yes |
| `retention` | 2 (retention_policy, deletion_process) | ✅ Yes |
| `logging` | 2 (admin_audit_log, alert_monitoring) | ✅ Yes |
| `subprocessors` | 2 (subprocessor_list, subprocessor_review) | ✅ Yes |
| `encryption_at_rest` | 2 (algorithms, scope) | ✅ Yes |
| `encryption_in_transit` | 2 (tls_policy, inter_service) | ✅ Yes |
| `business_continuity` | 3 (rto_rpo, backup_frequency, dr_testing) | ✅ Yes |
| `vulnerability_management` | 4 (scanning, remediation_sla, pentest, secure_sdlc) | ✅ Yes |
| `mfa` | 3 (admin_mfa, user_mfa, mfa_methods) | ✅ Yes |
| `sso` | 2 (saml_oidc, scim_provisioning) | ✅ Yes |
| `data_classification` | 2 (label_taxonomy, handling_rules) | ✅ Yes |
| `tenant_isolation` | 3 (logical_isolation, network_isolation, evidence_export) | ✅ Yes |

### Mapping Stability Assessment
✅ **STABLE ENOUGH** for V1 contradiction detection:
- Both row and canonical answer link to same topic table
- Sub-control key system provides granular matching
- Taxonomy is version-controlled in code (single source of truth)
- Embedding-based matching already uses sub-control labels

---

## 5. Existing Reusable Logic

### A. Answer Eligibility & Fitness Checks
**File**: `@/lib/knowledge/answer-workflow.ts`

```typescript
// Checks if canonical answer is approved for internal use
isEligibleForInternalReuse({ status, governanceStatus }): boolean

// Checks if canonical answer is approved for export (strictest)
isEligibleForExportReuse({ status, governanceStatus, approvalScope, exportSafe, nextReviewDueAt }): boolean
```
**Reusability**: ✅ Use to filter which canonical answers can be "truth" for contradiction comparison.

### B. Text Comparison (Row vs. Suggested)
**File**: `@/lib/knowledge/answer-export-safety.ts`

```typescript
// Returns true if finalAnswer matches suggestedAnswer text
reviewedRowUsesSuggestedLibraryText({ finalAnswer, suggestedAnswer }): boolean
```
**Reusability**: ✅ Pattern for text comparison, but this only checks exact match. Contradiction detection needs semantic comparison (e.g., "yes" vs "we do not" should flag contradiction).

### C. Freshness/Expiry Checks
**File**: `@/lib/knowledge/answer-freshness.ts`

```typescript
// Checks if answer is past due for review
isPastDue(now, nextReviewDueAt): boolean

// Returns bucket: "current" | "expiring_soon" | "expired_or_past_due"
freshnessBucket(now, answer): string

// Applies freshness penalty to matching scores
matcherFreshnessPenalty(score, freshness): number
```
**Reusability**: ✅ Use to weight contradiction severity — stale canonical answers should trigger lower-confidence contradictions.

### D. Verification/Judge Infrastructure
**File**: `@/modules/workspaces/intelligence/verify-questionnaire-matching.ts`

```typescript
// LLM-based verification of answer quality
VerificationService.verifyMatch(question, answer, evidence): Promise<VerificationResult>
```
**Reusability**: ⚠️ Could be extended for semantic contradiction detection, but would need new prompt engineering.

### E. Confidence Scoring System
**File**: `@/modules/workspaces/intelligence/questionnaire-matching-service.ts`

```typescript
// Existing confidence calculation for matching
WEIGHTS = {
  TOPIC_SIMILARITY: 0.30,
  ANSWER_SIMILARITY: 0.20,
  SOURCE_TRUST: 0.15,
  EVIDENCE_BONUS: 0.20,
  VERIFIER_BONUS: 0.15,
}
```
**Reusability**: ⚠️ Pattern for scoring, but contradiction needs different weights (semantic opposition > similarity).

---

## 6. Existing Reusable UI/Workflow

### A. Review Table (List View)
**File**: `@/components/questionnaires/review-table.tsx` + `@/components/questionnaires/review-row.tsx`

- Already displays "conflict" status with yellow warning styling
- Shows topic badges, confidence pills, export safety tiers
- Supports row selection, filtering by status
- **Reusability**: ✅ Conflict state already rendered — just need to populate it with canonical contradictions

### B. Evidence Drawer (Detail View)
**File**: `@/components/questionnaires/evidence-drawer.tsx`

- Displays full question, suggested answer, final answer
- Shows provenance (origin, sources, verifier result)
- Supports Accept, Reject, Edit, Quick Approve actions
- Override reason capture (category + comment + scope)
- **Conflict Banner Already Exists** (lines 270-279):
```tsx
{isConflict && !isReviewed && (
  <div className="flex items-start gap-4 rounded-xl border border-semantic-warning-border bg-semantic-warning/[0.03] p-5 shadow-sm">
    <div className="mt-0.5 rounded-full bg-semantic-warning/10 p-1.5 ring-4 ring-semantic-warning/[0.02]">
      <WarningIcon className="h-4 w-4 text-semantic-warning" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-bold text-semantic-warning">Evidence Contradiction</p>
      <p className="text-xs leading-relaxed text-text-secondary">
        {question.conflictNote || "Multiple source documents provided conflicting information..."}
      </p>
    </div>
  </div>
)}
```
**Reusability**: ✅ Banner pattern exists — just need to add "Canonical Contradiction" variant with different messaging.

### C. Existing Resolution Actions
Available in evidence drawer:
1. **Accept** — marks reviewed, keeps suggested answer
2. **Reject** — marks rejected, clears answer
3. **Edit** — allows manual text override
4. **Quick Approve** — promotes draft to approved library content
5. **Override with reason** — captures why final answer differs from suggestion

**Reusability**: ✅ Most actions reusable for contradiction resolution:
- Accept = "Agree with contradiction, update canonical answer"
- Override = "Disagree with contradiction, keep row answer"
- Edit = "Revise answer to align with canonical"

### D. Audit Trail Display
**File**: `@/components/audit/AuditTrailSection.tsx`

- Displays timeline of audit events
- Supports filtering by event type
**Reusability**: ✅ Can display contradiction detection/resolution events once added to audit taxonomy.

---

## 7. V1 Topic Readiness List

### Recommended 8-10 Topics for Initial Rule Pack

| Rank | Topic Key | Readiness | Rationale |
|------|-----------|-----------|-----------|
| 1 | `access_control` | ✅ HIGH | 7 well-defined sub-controls, binary/categorical answers, high questionnaire frequency |
| 2 | `mfa` | ✅ HIGH | 3 sub-controls, typically yes/no answers, common compliance question |
| 3 | `encryption_at_rest` | ✅ HIGH | 2 sub-controls, algorithm/scope questions, easy to validate |
| 4 | `encryption_in_transit` | ✅ HIGH | 2 sub-controls, TLS version/policy questions, deterministic |
| 5 | `retention` | ✅ HIGH | 2 sub-controls, time-period questions, comparable |
| 6 | `logging` | ✅ MEDIUM | 2 sub-controls, audit/alert questions, slightly more variability |
| 7 | `incident_response` | ✅ MEDIUM | 4 sub-controls, process questions, may need semantic analysis |
| 8 | `business_continuity` | ✅ MEDIUM | 3 sub-controls, RTO/RPO questions, numeric comparison possible |

### Topics to Defer (V2+)
| Topic | Reason |
|-------|--------|
| `vulnerability_management` | Complex process descriptions, harder to compare |
| `sso` | Technical protocol variations, needs semantic analysis |
| `data_classification` | Taxonomy varies by organization, less standardized |
| `tenant_isolation` | Architecture-specific, less questionnaire coverage |
| `subprocessors` | List-based answers, comparison logic different |

---

## 8. Gap Analysis Table

| Capability | Current Status | Implementation Notes | Reusable Components | Risk if Reused | Recommended Next Step |
|------------|---------------|---------------------|---------------------|----------------|----------------------|
| **Canonical answer retrieval** | ✅ Implemented | `isEligibleForExportReuse()` filters approved answers | `answer-workflow.ts`, Prisma queries | Low | Extend with "latest approved by topic" helper |
| **Row answer retrieval** | ✅ Implemented | Questionnaire API returns full row data | `/api/questionnaires/{id}/review` | Low | Add contradiction fields to DTO |
| **Topic mapping** | ✅ Implemented | Both models link to KnowledgeTopic | `subcontrol-taxonomy.ts` | Low | Ensure subControlKey populated consistently |
| **Rule engine infrastructure** | ❌ Missing | No rule definition or execution system | None | N/A | Build rule pack loader + executor |
| **Contradiction comparison logic** | ⚠️ Partial | Only `reviewedRowUsesSuggestedLibraryText()` — exact match only | `answer-export-safety.ts` | High (exact match insufficient) | Build semantic + deterministic comparison |
| **Deterministic rule packs** | ❌ Missing | No JSON/YAML rule definitions exist | Sub-control taxonomy as template | Medium | Define rule format, create rules for 8 topics |
| **Semantic contradiction judge** | ⚠️ Partial | `VerificationService.verifyMatch()` exists but needs new prompts | `verify-questionnaire-matching.ts` | Medium | Extend with contradiction detection prompt |
| **Contradiction persistence** | ⚠️ Partial | `conflictNote` field exists, no structured storage | QuestionnaireItem table | Medium | Add `contradictionJson` field or separate table |
| **Contradiction UI banner** | ✅ Implemented | Evidence drawer already shows conflict banner | `evidence-drawer.tsx` lines 270-279 | Low | Repurpose with "Canonical Contradiction" variant |
| **Resolve modal** | ⚠️ Partial | Override UI exists, not specific to contradiction | Override UI in drawer | Low | Extend with contradiction-specific actions |
| **Contradiction audit trail** | ❌ Missing | No audit event types for contradictions | `AUDIT_EVENT_TYPES` | N/A | Add `QUESTIONNAIRE_ITEM_CONTRADICTION_DETECTED`, `_RESOLVED` |
| **Export blocking integration** | ✅ Implemented | Export already checks `isEligibleForExportReuse()` | `questionnaire-export-service.ts` | Low | Extend to check contradiction status |
| **Re-run on canonical update** | ❌ Missing | No trigger system for re-evaluating contradictions | None | N/A | Build change detection + re-run pipeline |
| **Analytics/reporting** | ❌ Missing | No contradiction metrics or dashboards | Governance queues pattern | Medium | Add contradiction counts to governance |

---

## 9. Root Cause Risks / Blockers

### Primary Blockers

1. **No Rule Engine Infrastructure**
   - Risk: Rules end up hardcoded in TypeScript, hard to maintain
   - Mitigation: Build simple JSON rule format first, evaluate DSL later

2. **Semantic Comparison Complexity**
   - Risk: Simple text comparison misses semantic contradictions ("yes" vs "we enable MFA" should match)
   - Mitigation: Hybrid approach — deterministic rules for clear cases, LLM judge for ambiguous cases

3. **Sub-Control Mapping Inconsistency**
   - Risk: Some rows may have `topicId` but not `subControlKey`, causing false negatives
   - Mitigation: Backfill migration + validation at import time

4. **Canonical Answer Currency**
   - Risk: Contradiction detected against stale answer; canonical gets updated but contradiction persists
   - Mitigation: Store canonical answer version ID at detection time, re-run on canonical update

### Secondary Risks

5. **Override Scope Ambiguity**
   - Current override system has `QUESTIONNAIRE_ONLY` vs `REQUEST_CANONICAL_UPDATE`
   - Risk: Users may not understand when contradiction should trigger canonical update request
   - Mitigation: Clear UX in resolve modal explaining implications

6. **Performance at Scale**
   - Risk: Contradiction detection could slow down questionnaire import/review
   - Mitigation: Async processing, cache results, incremental re-checks only

---

## 10. Recommended Build Direction

### Minimal Viable Build Path (MVP — 2-3 weeks)

**Goal**: Detect obvious contradictions for top 4 topics, show banner, allow dismiss

1. **Build rule executor** (3 days)
   - JSON rule format for deterministic checks
   - Rules for: access_control, mfa, encryption_at_rest, encryption_in_transit
   - Rule types: `exact_match`, `contains`, `regex`, `numeric_range`

2. **Build comparison service** (3 days)
   - `ContradictionDetectionService.detect(row, canonicalAnswer, rules)`
   - Returns: `contradictionFound: boolean, severity: "high"|"medium", reason: string`
   - Store result in `conflictNote` field (JSON stringified)

3. **Trigger on review load** (2 days)
   - Call detection service when `/api/questionnaires/{id}/review` loads
   - Update `reviewStatus` to `"conflict"` if contradiction found
   - Populate `conflictNote` with structured result

4. **UI banner repurposing** (2 days)
   - Extend evidence drawer conflict banner to show "Canonical Contradiction"
   - Different icon/color from evidence conflict
   - Show canonical answer excerpt

5. **Dismiss action** (2 days)
   - "Acknowledge" button marks as reviewed despite contradiction
   - Override reason capture (reuse existing system)

### Strong Production-Grade Build Path (Full Epic — 6-8 weeks)

**Goal**: Full rule pack for 8-10 topics, semantic detection, audit trail, re-run on update

**Phase 1: Foundation (Weeks 1-2)**
- Build `ContradictionRule` table (persist rules in DB, not just JSON)
- Build `ContradictionResult` table (separate from `conflictNote`)
- Add audit event types for contradiction lifecycle
- Build detection service with pluggable rule engine

**Phase 2: Rule Packs (Weeks 3-4)**
- Define rule format supporting deterministic + semantic rules
- Create rule packs for 8 topics (access_control, mfa, encryption_* , retention, logging, incident_response, business_continuity)
- Build rule testing framework (unit tests for each rule)

**Phase 3: Semantic Detection (Weeks 5-6)**
- Extend `VerificationService` with contradiction detection prompt
- Build LLM judge for ambiguous cases
- Hybrid scoring: deterministic rules (high confidence) + semantic judge (medium confidence)

**Phase 4: Resolution & Audit (Weeks 7-8)**
- Build dedicated "Resolve Contradiction" modal
- Actions: "Update Canonical Answer", "Keep Row Answer", "Edit Row Answer"
- Audit trail for all contradiction resolutions
- Governance queue integration (show contradictions needing resolution)
- Re-run detection when canonical answers updated

### What Must Be Built First

1. **Rule format definition** — Blocks all rule creation
2. **Detection service interface** — Blocks integration with review flow
3. **Contradiction result persistence** — Blocks audit trail and re-run capability
4. **Top 4 topic rule packs** — Blocks MVP release

---

## Appendix A: File Inventory for Implementation

### Core Logic Files
| File | Purpose | Modify/Create |
|------|---------|---------------|
| `src/lib/contradiction/rule-engine.ts` | Rule parsing & execution | CREATE |
| `src/lib/contradiction/detection-service.ts` | Main detection orchestrator | CREATE |
| `src/lib/contradiction/rules/*.json` | Topic-specific rule packs | CREATE |
| `src/modules/knowledge/topics/subcontrol-taxonomy.ts` | Sub-control definitions | READ-ONLY reference |
| `src/lib/knowledge/answer-workflow.ts` | Eligibility helpers | READ-ONLY reuse |

### API Files
| File | Purpose | Modify/Create |
|------|---------|---------------|
| `src/app/api/questionnaires/[id]/review/route.ts` | Load questionnaire rows | MODIFY — add contradiction check |
| `src/app/api/questionnaires/[id]/items/[itemId]/contradiction/route.ts` | Get contradiction details | CREATE |
| `src/app/api/questionnaires/[id]/items/[itemId]/resolve/route.ts` | Resolve contradiction | CREATE |
| `src/app/api/knowledge/answers/[id]/contradictions/route.ts` | Check all rows using this answer | CREATE |

### UI Files
| File | Purpose | Modify/Create |
|------|---------|---------------|
| `src/components/questionnaires/evidence-drawer.tsx` | Detail view with banner | MODIFY — add canonical contradiction section |
| `src/components/questionnaires/review-row.tsx` | Row conflict indicator | MODIFY — add canonical contradiction styling |
| `src/components/questionnaires/contradiction-banner.tsx` | Reusable banner component | CREATE |
| `src/components/questionnaires/resolve-contradiction-modal.tsx` | Resolution workflow | CREATE |

### Database
| Table | Purpose | Modify/Create |
|-------|---------|---------------|
| `QuestionnaireItem` | Add `contradictionJson` field or use `conflictNote` | MODIFY |
| `ContradictionResult` | New table for structured results | CREATE |
| `ContradictionRule` | New table for rule definitions | CREATE (optional, can start with JSON files) |

---

**End of Report**

**Next Steps**:
1. Review and approve MVP vs. Full Epic scope
2. Define JSON rule format for deterministic checks
3. Create rule packs for top 4 MVP topics
4. Build detection service interface
5. Integrate with review page load
