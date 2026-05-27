# V1 contradiction rule packs

JSON rule packs consumed by [`loadRulePack`](../rule-loader.ts) and evaluated by [`detect`](../detection-service.ts) against a questionnaire row and an approved canonical answer.

Sub-control keys **must** match [`SUBCONTROLS_BY_TOPIC_KEY`](../../../modules/knowledge/topics/subcontrol-taxonomy.ts) for the same `topicKey`. Rules with no `subControlKey` apply to every sub-control for that topic; otherwise the row’s `subControlKey` must match.

## Engine semantics (short)

- **`boolean_polarity`**: Detects positive vs negative stance using substring lists. If both sides have clear, opposite polarity, that is a contradiction. If a single text matches both positive and negative indicators equally often, polarity is treated as ambiguous (no hit). Avoid substrings like bare `no` inside unrelated words where possible; prefer multi-word indicators in pack JSON.
- **`enum_mismatch`**: Finds the first listed `enumValues` entry that appears as a substring of each answer (lower-cased). If both sides find a value and they differ, that is a contradiction. `equivalencies` normalize synonyms before comparison.
- **`contains`**: Measures word overlap from canonical to row (`calculateCoverage`). If coverage is **below** `minCoverage`, that is a contradiction (row is missing canonical themes).
- **`forbidden_term`**: Row-only. If any forbidden phrase appears in the row (whole-word by default), that is a contradiction. Does not inspect canonical text; use for clearly unsafe row claims (e.g. deprecated TLS in the row).
- **`required_term_missing`**: Row must contain at least `minRequired` terms from `requiredTerms`. If **`canonicalContainsAny`** is set, this rule **does nothing** unless the canonical answer contains at least one of those phrases (case-insensitive). Use this when the requirement is conditional on what canonical actually asserts (e.g. MFA mandatory vs optional).

Regression fixtures live in [`../__tests__/fixtures/v1-rule-pack-cases.ts`](../__tests__/fixtures/v1-rule-pack-cases.ts) and are executed by [`../__tests__/v1-topic-rule-packs.test.ts`](../__tests__/v1-topic-rule-packs.test.ts).

---

## access_control.json

| Rule id | Type | Sub-control | When it fires |
| --- | --- | --- | --- |
| `access_control_rbac_polarity` | boolean_polarity | rbac | Row and canonical express opposite yes/no style RBAC posture. |
| `access_control_access_request_polarity` | boolean_polarity | access_request | Formal request path (tickets, portal) vs informal claims. |
| `access_control_access_approval_polarity` | boolean_polarity | access_approval | Manager approval / logging vs self-approval or informal approval. |
| `access_control_access_approval_forbidden` | forbidden_term | access_approval | Row uses disallowed informal approval phrases. |
| `access_control_review_frequency` | enum_mismatch | access_review | Stated cadence (e.g. quarterly vs annually) differs. |
| `access_control_offboarding_forbidden` | forbidden_term | offboarding | Row claims slow or manual-only offboarding at odds with canonical automation. |
| `access_control_privileged_polarity` | boolean_polarity | privileged_access | Privileged access enforcement yes/no mismatch. |
| `access_control_privileged_contains` | contains | privileged_access | Row is missing a large share of canonical privileged-access wording. |
| `access_control_admin_mfa_required` | required_term_missing (+ gate) | admin_mfa | Canonical asserts mandatory/required posture (gate), but row never mentions MFA/2FA. |

---

## mfa.json

| Rule id | Type | Sub-control | When it fires |
| --- | --- | --- | --- |
| `mfa_admin_polarity` | boolean_polarity | admin_mfa | Admin MFA required vs optional/disabled mismatch. |
| `mfa_user_polarity` | boolean_polarity | user_mfa | End-user MFA required vs optional/not enabled mismatch. |
| `mfa_methods_enum` | enum_mismatch | mfa_methods | Both answers imply a concrete method family (e.g. WebAuthn vs SMS) and they disagree. |
| `mfa_methods_required` | required_term_missing (+ gate) | mfa_methods | Canonical lists concrete methods (gate), row does not name any. |
| `mfa_phishing_resistant` | forbidden_term | admin_mfa | Row cites weak MFA-only patterns (SMS-only, etc.). Row-only heuristic. |

---

## encryption_at_rest.json

| Rule id | Type | Sub-control | When it fires |
| --- | --- | --- | --- |
| `encryption_at_rest_scope_polarity` | boolean_polarity | scope | Clear at-rest encryption yes vs no/plaintext-style mismatch. |
| `encryption_at_rest_scope_coverage` | contains | scope | Row is missing a large share of canonical scope wording. |
| `encryption_at_rest_algorithm_exact` | enum_mismatch | algorithms | Different algorithm identifiers (e.g. AES-256 vs AES-128) when both present. |
| `encryption_at_rest_kms_required` | required_term_missing (+ gate) | algorithms | Canonical mentions KMS/HSM/envelope (gate), row omits key-management language. |

---

## encryption_in_transit.json

| Rule id | Type | Sub-control | When it fires |
| --- | --- | --- | --- |
| `encryption_in_transit_tls_required_polarity` | boolean_polarity | tls_policy | TLS/HTTPS required vs cleartext/optional TLS mismatch. |
| `encryption_in_transit_tls_version_enum` | enum_mismatch | tls_policy | Different minimum TLS versions when both answers specify one. |
| `encryption_in_transit_tls_weak_forbidden` | forbidden_term | tls_policy | Row references deprecated protocol versions (SSL 3.0, TLS 1.0/1.1). |
| `encryption_in_transit_inter_service_polarity` | boolean_polarity | inter_service | mTLS/mesh-style internal encryption vs cleartext internal claims. |
| `encryption_in_transit_inter_service_mtls_required` | required_term_missing (+ gate) | inter_service | Canonical requires mesh/mTLS (gate), row omits internal encryption wording. |

---

## Other files

- `retention.json` — separate topic pack; not part of the four-topic MVP slice.

## Versioning

Use semantic version strings on the pack (`version`) and bump when rules change in a breaking way. `lastUpdated` should reflect the change date (ISO `YYYY-MM-DD`).
