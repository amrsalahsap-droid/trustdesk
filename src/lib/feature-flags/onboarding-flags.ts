/**
 * Env-driven feature flags for the onboarding intelligence pipeline.
 * Production: all off unless explicitly set to "1"/"true".
 * Non-production: on by default so staging/dev exercise new paths; set env to "0" to disable.
 */
const isProd = process.env.NODE_ENV === "production";

function readBool(envName: string, defaultInNonProd: boolean): boolean {
  const raw = process.env[envName]?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return isProd ? false : defaultInNonProd;
}

/** Canary: enable for ~10% of workspaces when TRUSTDESK_ONBOARDING_CANARY_PCT is set (0–100). */
export function onboardingCanaryEnabled(workspaceId: string, pct: number): boolean {
  if (pct <= 0) return false;
  if (pct >= 100) return true;
  let h = 0;
  for (let i = 0; i < workspaceId.length; i++) {
    h = (h * 31 + workspaceId.charCodeAt(i)) >>> 0;
  }
  return h % 100 < pct;
}

export function onboardingCanaryPct(): number {
  const n = Number(process.env.TRUSTDESK_ONBOARDING_CANARY_PCT?.trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, Math.floor(n));
}

export const onboardingFlags = {
  /** Phase 1: weak crawl / thin evidence → no profile persistence; honest UI. */
  get failClosedInference(): boolean {
    return readBool("TRUSTDESK_FAIL_CLOSED_INFERENCE", true);
  },
  /** Phase 2: shorter timeouts, retries, redirect/trace metadata on fetches. */
  get robustCrawler(): boolean {
    return readBool("TRUSTDESK_ROBUST_CRAWLER", true);
  },
  /** Phase 3: strip uncited HYPOTHESIZED/DERIVED fields; zod-validate AI JSON. */
  get strictInference(): boolean {
    return readBool("TRUSTDESK_STRICT_INFERENCE", true);
  },
  /** Phase 4: per-doc briefs, doc-type rules, template prompt without library boilerplate, stronger quality gate. */
  get docTypeTailoring(): boolean {
    return readBool("TRUSTDESK_DOC_TYPE_TAILORING", true);
  },
  /**
   * Playwright Chromium render pass for thin static HTML (SPAs). Off in prod by default;
   * on in non-prod. Requires `npx playwright install chromium` where used.
   */
  get renderedFallback(): boolean {
    return readBool("TRUSTDESK_RENDERED_FALLBACK", true);
  },
  /**
   * Enhanced domain crawler with sitemap parsing, deeper link discovery,
   * and high-value page prioritization. On by default in non-prod.
   */
  get enhancedDomainCrawler(): boolean {
    return readBool("TRUSTDESK_ENHANCED_DOMAIN_CRAWLER", true);
  },
};

/**
 * Effective flag for server routes that have a workspaceId (production canary).
 * In non-prod, ignores canary and uses the base flag only.
 */
export function effectiveOnboardingFlag(
  flag: keyof typeof onboardingFlags,
  workspaceId?: string,
): boolean {
  const base = onboardingFlags[flag] as boolean;
  if (!base) return false;
  if (!isProd) return true;
  const pct = onboardingCanaryPct();
  if (pct <= 0 || !workspaceId) return true;
  return onboardingCanaryEnabled(workspaceId, pct);
}
