# Resilient Enterprise Domain Analysis

## Goal
Make TrustDesk’s onboarding analysis robust for large enterprise sites (e.g., `enterprisedb.com`). The system must gracefully handle AI JSON parsing failures, provide deterministic fallback fields, discover high‑value sub‑domains, and improve authority scoring without forcing a manual fallback.

## User Review Required
> [!IMPORTANT] **Changes affect core analysis pipeline** – ensure new fallback logic does not break existing workflows.

## Open Questions
> [!WARNING] **AI Provider Configuration** – do we want to expose a config flag to toggle the strict‑JSON retry, or always enable it?
> - (Recommended) Expose `analysis.strictJsonRetry` in `src/lib/ai/ai-config.ts`.
> - Should schema‑repair be attempted only for known schemas (e.g., Trust Profile)?

> [!WARNING] **Budget for high‑value sub‑domains** – what is the maximum additional pages per analysis?
> - Suggested default: `maxHighValuePages = 10`.

## Proposed Changes
---
### 1️⃣ AI JSON Failure Resilience (`src/lib/ai/providers/*` and `website-analysis-service.ts`)
- **Wrapper** around `AiProvider.generateObject` that catches parsing errors.
- **Retry** once with a stricter prompt (`"Respond ONLY with valid JSON matching schema X"`).
- **Schema Repair**: If the response contains a JSON‑like fragment, attempt a safe repair using `jsonrepair` (only if the fragment parses to the expected top‑level keys).
- **Deterministic Fallback**: If all attempts fail, call a new deterministic extractor (`DeterministicProfileExtractor`) and mark fields with `source: "fallback"` and `status: "needs_review"`.
- **Preserve Evidence**: Do not discard `evidenceItems`; store them under `analysis.evidence` even when AI fails.

---
### 2️⃣ Deterministic Fallback Profile (`src/modules/workspaces/onboarding/deterministic-profile-extractor.ts`)
- Parse extracted page text (already stored in `EvidenceItem` objects) using regex / keyword maps to infer:
  - `businessDomain`
  - `productType`
  - `deployment` (cloud, on‑prem, hybrid)
  - `customerSegment`
  - `capabilities` (e.g., "data classification", "cloud scanning")
  - `compliance/trust signals` (privacy‑policy, trust‑center links)
- Populate a `Partial<TrustProfile>` with `source: "fallback"`, `status: "needs_review"` and include citations (page URLs + snippet).
- Export a new utility `createFallbackProfile(evidence: EvidenceItem[]): TrustProfile`.

---
### 3️⃣ High‑Value Sub‑domain Support (`domain-crawler.ts`)
- Extend `highValuePatterns` to include sub‑domains matching:
  - `trust.*`
  - `security.*`
  - `compliance.*`
  - `privacy.*`
  - `docs.*`
  - `support.*`
- When the homepage `<a>` tags point to any of these, enqueue the full URL (respecting `maxPages` budget). Track them in `highValuePagesFound`.
- Add a new log entry `"high‑value sub‑domain discovered"`.

---
### 4️⃣ Source Authority Scoring (`website-analysis-service.ts` & scoring utils)
- Increase `authorityScore` by **+20** for any discovered *trust center* sub‑domain that is successfully fetched.
- If the sub‑domain is discovered but returns a non‑2xx status, log:
  ```json
  {"level":"info","message":"trust-center:discovered‑but‑unreachable","url":"https://trust.enterprisedb.com"}
  ```
- Adjust `trustCenterDiscovered` flag in the result object.

---
### 5️⃣ Manual Fallback Softening (`website-analysis-service.ts`)
- After analysis, compute:
  - `fetchSuccessRatio = pagesSuccessful / pagesAttempted`
  - `hasUsefulContent = totalUsefulChars > 0`
  - `hasFallbackFields = fallbackProfile !== undefined`
- If `fetchSuccessRatio > 0.5 && hasUsefulContent && hasFallbackFields`, set `analysisStatus = "limited_tailoring"` instead of `"needs_manual"`.
- Return the deterministic fallback profile alongside any AI‑generated fields.

---
### 6️⃣ Tests & Validation
- Add unit tests in `src/modules/workspaces/onboarding/__tests__/` covering:
  - AI JSON missing → retry → fallback.
  - High‑value sub‑domain discovery.
  - Authority scoring boost.
  - Manual fallback softening logic.
- Update existing integration tests to expect `limited_tailoring` for `enterprisedb.com`.

---
## Verification Plan
### Automated Tests
- `npm run test` – ensure all existing tests pass.
- New tests for the above scenarios.
### Manual Verification
- Run the onboarding flow for `https://www.enterprisedb.com/` and verify:
  - No `needs_manual` status.
  - Log entries for trust‑center discovery.
  - Returned profile contains fallback fields marked `needs_review`.
  - Authority score reflects trust‑center boost.

---
## Risks & Mitigations
- **Risk:** Over‑eager fallback may produce noisy fields.
  - *Mitigation:* Only emit fields when a confident keyword match is found; otherwise leave undefined.
- **Risk:** Schema‑repair could introduce malformed data.
  - *Mitigation:* Restrict repair to well‑known top‑level keys and validate against the TrustProfile schema before accepting.

---
**Next Steps:**
1. Add the `DeterministicProfileExtractor` utility.
2. Wrap AI provider calls with the new resilience logic.
3. Extend crawler to detect high‑value sub‑domains.
4. Adjust scoring and fallback decision logic.
5. Write/adjust tests.
6. Run manual verification on `enterprisedb.com`.
