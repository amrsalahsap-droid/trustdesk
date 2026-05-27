import { HIGH_SIGNAL_TYPES, type PageType } from "./page-discovery";

/**
 * Structured evidence preservation for onboarding website analysis.
 *
 * Instead of flattening all extracted page signals into one opaque string,
 * we preserve each kind of evidence as its own typed block:
 *   - `meta`            — meta description / og / canonical tags
 *   - `json-ld`         — parsed structured data (highest trust when parsed)
 *   - `heading-section` — an <h1|h2|h3> with the body text that follows it
 *   - `body-fallback`   — remaining scrubbed visible text as safety net
 *
 * Downstream, the prompt builder renders these blocks with labeled sections
 * so the inference model sees semantic scaffolding rather than a blob, and
 * each inferred Signal can be traced back to a concrete block via
 * {@link SignalCitation}.
 *
 * Pure functions only. No I/O. Unit-testable offline.
 */

export type EvidenceKind = "meta" | "json-ld" | "heading-section" | "body-fallback";

export type MetaEvidence = {
  kind: "meta";
  metaDescription?: string;
  ogDescription?: string;
  ogTitle?: string;
  canonicalUrl?: string;
};

export type JsonLdEvidence = {
  kind: "json-ld";
  index: number;
  /** parsed @type string when JSON.parse succeeded; may be array joined with "/" */
  type?: string;
  /** bounded structured object from JSON.parse; absent if parse failed */
  parsed?: unknown;
  /** truncated raw text as fallback */
  raw: string;
};

export type HeadingSectionEvidence = {
  kind: "heading-section";
  level: 1 | 2 | 3;
  heading: string;
  /** text between this heading and the next heading of same-or-higher level, capped */
  bodyText: string;
};

export type BodyFallbackEvidence = {
  kind: "body-fallback";
  /** scrubbed visible text, bounded */
  text: string;
};

export type EvidenceBlock =
  | (MetaEvidence & { source: "meta" })
  | (JsonLdEvidence & { source: "json_ld" })
  | (HeadingSectionEvidence & { source: "visible_text" | "rendered_text" })
  | (BodyFallbackEvidence & { source: "visible_text" | "rendered_text" });

/** How page HTML was obtained before structured extraction (in-memory only). */
export type EvidenceContentSource = "static" | "rendered" | "hybrid";

export type StructuredPageEvidence = {
  url: string;
  title: string;
  pageType: PageType;
  score: number;
  blocks: EvidenceBlock[];
  /** 0..1 — composite of block coverage + page-type weight, deterministic. */
  sourceConfidence: number;
  /**
   * Whether evidence came from static fetch, headless render, or a merge of both.
   * Omitted means legacy/static-only pages.
   */
  contentSource?: EvidenceContentSource;
};

/** Lightweight per-field citation emitted via the API for UI consumption. */
export type SignalCitation = {
  pageUrl: string;
  pageType: PageType;
  evidenceKind: EvidenceKind;
  /** ≤ 160 chars, for "why" display in UI */
  excerpt?: string;
};

/** Compact per-page summary safe to return over the API (no raw bodies). */
export type PageEvidenceSummary = {
  url: string;
  title: string;
  pageType: PageType;
  score: number;
  sourceConfidence: number;
  contentSource?: EvidenceContentSource;
  evidenceKinds: EvidenceKind[];
  headingsCount: number;
  jsonLdTypes: string[];
};

// --- Bounds ---
const META_FIELD_CAP = 400;
const JSON_LD_RAW_CAP = 2000;
const JSON_LD_PARSED_STRING_CAP = 1500;
const HEADING_BODY_CAP = 400;
const MAX_HEADING_SECTIONS = 5;
const MAX_JSON_LD_BLOCKS = 3;
const BODY_FALLBACK_CAP = 1500;
const EXCERPT_CAP = 160;

// --- Low-level extraction helpers ---

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function cap(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

function matchMetaTag(html: string, pattern: RegExp): string | undefined {
  const m = html.match(pattern);
  if (!m || !m[1]) return undefined;
  return cap(decodeEntities(m[1]).trim(), META_FIELD_CAP);
}

function extractMetaEvidence(html: string): MetaEvidence | null {
  const metaDescription = matchMetaTag(
    html,
    /<meta\s+[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i,
  );
  const ogDescription = matchMetaTag(
    html,
    /<meta\s+[^>]*property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']*)["']/i,
  );
  const ogTitle = matchMetaTag(
    html,
    /<meta\s+[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i,
  );
  const canonicalUrl = matchMetaTag(
    html,
    /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']*)["']/i,
  );

  if (!metaDescription && !ogDescription && !ogTitle && !canonicalUrl) return null;

  return {
    kind: "meta",
    source: "meta",
    metaDescription,
    ogDescription,
    ogTitle,
    canonicalUrl,
  };
}

function extractJsonLdType(parsed: unknown): string | undefined {
  if (!parsed || typeof parsed !== "object") return undefined;
  const raw = (parsed as Record<string, unknown>)["@type"];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.filter((x) => typeof x === "string").join("/");
  return undefined;
}

function extractJsonLdEvidence(html: string): JsonLdEvidence[] {
  const out: JsonLdEvidence[] = [];
  const matches = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  let index = 0;
  for (const m of matches) {
    if (out.length >= MAX_JSON_LD_BLOCKS) break;
    const raw = m[1].trim();
    if (!raw) {
      index += 1;
      continue;
    }

    let parsed: unknown | undefined;
    let type: string | undefined;
    try {
      const candidate = JSON.parse(raw);
      // Bound the parsed tree to avoid dragging giant graphs into prompts/logs.
      const boundedString = JSON.stringify(candidate);
      if (boundedString.length <= JSON_LD_PARSED_STRING_CAP) {
        parsed = candidate;
      } else {
        // Keep only top-level scalar + @type info to stay bounded.
        if (Array.isArray(candidate)) {
          parsed = candidate.slice(0, 3);
        } else if (candidate && typeof candidate === "object") {
          const obj = candidate as Record<string, unknown>;
          const slim: Record<string, unknown> = {};
          for (const key of Object.keys(obj).slice(0, 12)) {
            const v = obj[key];
            if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
              slim[key] = v;
            }
          }
          parsed = slim;
        }
      }
      type = extractJsonLdType(candidate);
    } catch {
      // parse failed — keep raw only
    }

    out.push({
      kind: "json-ld",
      source: "json_ld",
      index,
      type,
      parsed,
      raw: cap(raw, JSON_LD_RAW_CAP),
    });
    index += 1;
  }
  return out;
}

/**
 * Parses heading+body sections from the raw HTML by splitting on <h1|h2|h3>.
 * Each section captures the heading text plus the visible body text up to the
 * next heading of same-or-higher level, with tags stripped.
 */
export function extractHeadingSections(html: string): HeadingSectionEvidence[] {
  const sections: Array<{ level: 1 | 2 | 3; heading: string; start: number; end: number }> = [];
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html)) !== null) {
    const level = Number(match[1]) as 1 | 2 | 3;
    const heading = decodeEntities(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!heading) continue;
    sections.push({
      level,
      heading,
      start: match.index + match[0].length,
      end: html.length,
    });
  }

  // Resolve each section's `end` as the index of the next heading of same-or-higher level.
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sections[j].level <= sections[i].level) {
        sections[i].end = html.length;
        // The next heading's tag starts somewhere before `start`; re-derive via another regex pass would be
        // overkill. We use the next heading's `start` minus an approximate tag length as the end.
        // Simpler: just use the next heading's match index, which is <= sections[j].start.
        // We recover that by locating the `<h{level}` right before sections[j].start.
        const searchRegion = html.slice(0, sections[j].start);
        const idx = searchRegion.search(new RegExp(`<h${sections[j].level}[^>]*>[^<]*$`, "i"));
        sections[i].end = idx >= 0 ? idx : sections[j].start;
        break;
      }
    }
  }

  const out: HeadingSectionEvidence[] = [];
  for (const s of sections) {
    if (out.length >= MAX_HEADING_SECTIONS) break;
    const segment = html.slice(s.start, s.end);
    const stripped = decodeEntities(
      segment
        .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) continue;
    out.push({
      kind: "heading-section",
      source: "visible_text", // Will be updated to rendered_text if appropriate by caller
      level: s.level,
      heading: cap(s.heading, 140),
      bodyText: cap(stripped, HEADING_BODY_CAP),
    });
  }
  return out;
}

function extractBodyFallback(html: string, sections: HeadingSectionEvidence[]): BodyFallbackEvidence | null {
  const scrubbed = decodeEntities(
    html
      .replace(/<(script|style|svg|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!scrubbed) return null;

  // If we already captured rich heading-section content, only keep a short
  // fallback to avoid blowing out the prompt budget. When no sections were
  // captured, the fallback is the primary body signal, so allocate more chars.
  const cap_ = sections.length > 0 ? Math.floor(BODY_FALLBACK_CAP / 2) : BODY_FALLBACK_CAP;
  return { kind: "body-fallback", source: "visible_text", text: cap(scrubbed, cap_) };
}

/**
 * Deterministic source-confidence score in [0, 1].
 * Higher when a page exposes more distinct, high-trust block kinds, and
 * when the page itself is a high-signal type (security/trust/privacy/compliance).
 */
export function computeSourceConfidence(blocks: EvidenceBlock[], pageType: PageType): number {
  const hasMeta = blocks.some((b) => b.kind === "meta");
  const hasJsonLdParsed = blocks.some((b) => b.kind === "json-ld" && b.parsed !== undefined);
  const hasJsonLdAny = blocks.some((b) => b.kind === "json-ld");
  const headingSections = blocks.filter((b) => b.kind === "heading-section").length;
  const bodyLen = blocks
    .filter((b): b is BodyFallbackEvidence => b.kind === "body-fallback")
    .reduce((n, b) => n + b.text.length, 0);

  const metaPart = hasMeta ? 0.4 : 0;
  const jsonLdPart = hasJsonLdParsed ? 0.3 : hasJsonLdAny ? 0.2 : 0;
  const headingsPart = 0.2 * Math.min(1, headingSections / 3);
  const bodyPart = 0.1 * (bodyLen >= 300 ? 1 : bodyLen / 300);

  const base = metaPart + jsonLdPart + headingsPart + bodyPart;
  const typeMultiplier = HIGH_SIGNAL_TYPES.has(pageType) ? 1.0 : 0.85;
  return Math.max(0, Math.min(1, base * typeMultiplier));
}

/**
 * Extract structured evidence from raw HTML. No network I/O; callers already
 * have the body in memory. `title` is passed separately since it is usually
 * already extracted by the fetch layer.
 */
export function extractStructuredEvidence(params: {
  html: string;
  url: string;
  title: string;
  pageType: PageType;
  score: number;
  contentSource?: EvidenceContentSource;
}): StructuredPageEvidence {
  const { html, url, title, pageType, score, contentSource } = params;

  const blocks: EvidenceBlock[] = [];

  const meta = extractMetaEvidence(html);
  if (meta) blocks.push(meta);

  for (const j of extractJsonLdEvidence(html)) blocks.push(j);

  const sections = extractHeadingSections(html);
  for (const s of sections) {
    if (contentSource === "rendered") s.source = "rendered_text";
    blocks.push(s);
  }

  const body = extractBodyFallback(html, sections);
  if (body) {
    if (contentSource === "rendered") body.source = "rendered_text";
    blocks.push(body);
  }

  return {
    url,
    title,
    pageType,
    score,
    blocks,
    sourceConfidence: computeSourceConfidence(blocks, pageType),
    ...(contentSource ? { contentSource } : {}),
  };
}

// --- Prompt rendering ---

function renderMeta(block: MetaEvidence): string {
  const lines: string[] = [];
  if (block.metaDescription) lines.push(`META_DESCRIPTION: "${block.metaDescription}"`);
  if (block.ogDescription) lines.push(`OG_DESCRIPTION: "${block.ogDescription}"`);
  if (block.ogTitle) lines.push(`OG_TITLE: "${block.ogTitle}"`);
  if (block.canonicalUrl) lines.push(`CANONICAL: ${block.canonicalUrl}`);
  return lines.join("\n");
}

function renderJsonLd(block: JsonLdEvidence): string {
  const header = `JSON_LD[${block.index}]${block.type ? ` (@type=${block.type})` : ""}:`;
  if (block.parsed !== undefined) {
    return `${header}\n${cap(JSON.stringify(block.parsed), JSON_LD_PARSED_STRING_CAP)}`;
  }
  return `${header}\n${block.raw}`;
}

function renderHeadingSection(block: HeadingSectionEvidence): string {
  return `[H${block.level}] "${block.heading}"\n     "${block.bodyText}"`;
}

/**
 * Renders a single page's structured evidence into a labeled prompt block.
 * Bounded; repeated call for N pages stays within the overall prompt budget
 * used by `performInference`.
 */
export function renderEvidenceForPrompt(evidence: StructuredPageEvidence): string {
  const parts: string[] = [];
  parts.push(`PAGE: ${evidence.url}`);
  parts.push(
    `TYPE: ${evidence.pageType}  (score=${evidence.score}, sourceConfidence=${evidence.sourceConfidence.toFixed(2)}${evidence.contentSource ? `, contentSource=${evidence.contentSource}` : ""})`,
  );
  if (evidence.title) parts.push(`TITLE: ${cap(evidence.title, 200)}`);

  const metaBlock = evidence.blocks.find((b): b is MetaEvidence => b.kind === "meta");
  if (metaBlock) parts.push("", renderMeta(metaBlock));

  const headingBlocks = evidence.blocks.filter(
    (b): b is HeadingSectionEvidence => b.kind === "heading-section",
  );
  if (headingBlocks.length > 0) {
    parts.push("", "VISIBLE_TEXT (HEADINGS):");
    for (const h of headingBlocks) parts.push(renderHeadingSection(h));
  }

  const bodyBlock = evidence.blocks.find((b): b is BodyFallbackEvidence => b.kind === "body-fallback");
  if (bodyBlock) parts.push("", `VISIBLE_TEXT (BODY):\n"${bodyBlock.text}"`);

  const jsonLdBlocks = evidence.blocks.filter((b): b is JsonLdEvidence => b.kind === "json-ld");
  if (jsonLdBlocks.length > 0) {
    parts.push("", "METADATA (JSON-LD):");
    for (const j of jsonLdBlocks) parts.push(renderJsonLd(j));
  }

  return parts.join("\n");
}

// --- Health-gate helper ---

/**
 * Flattens structured evidence into plain text for use by the existing
 * char-count based health gate. Intentionally simple: concatenate every
 * block's textual payload. Does not add section headers so the char count
 * reflects actual content, not scaffolding.
 */
export function flattenEvidenceToText(evidence: StructuredPageEvidence): string {
  const parts: string[] = [];
  for (const b of evidence.blocks) {
    switch (b.kind) {
      case "meta":
        if (b.metaDescription) parts.push(b.metaDescription);
        if (b.ogDescription) parts.push(b.ogDescription);
        if (b.ogTitle) parts.push(b.ogTitle);
        break;
      case "json-ld":
        parts.push(b.parsed !== undefined ? JSON.stringify(b.parsed) : b.raw);
        break;
      case "heading-section":
        parts.push(b.heading, b.bodyText);
        break;
      case "body-fallback":
        parts.push(b.text);
        break;
    }
  }
  return parts.join(" ");
}

function mergeMetaBlocks(a: MetaEvidence | undefined, b: MetaEvidence | undefined): MetaEvidence | undefined {
  if (!a && !b) return undefined;
  const pick = (x?: string, y?: string) => ((y?.length ?? 0) > (x?.length ?? 0) ? y : x) ?? x ?? y;
  return {
    kind: "meta",
    metaDescription: pick(a?.metaDescription, b?.metaDescription),
    ogDescription: pick(a?.ogDescription, b?.ogDescription),
    ogTitle: pick(a?.ogTitle, b?.ogTitle),
    canonicalUrl: a?.canonicalUrl ?? b?.canonicalUrl,
  };
}

function dedupeJsonLdBlocks(blocks: JsonLdEvidence[]): JsonLdEvidence[] {
  const seen = new Set<string>();
  const out: JsonLdEvidence[] = [];
  for (const b of blocks) {
    const key = `${b.index}:${b.raw.slice(0, 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
  }
  return out;
}

export function getUsableTextFromEvidence(evidence: StructuredPageEvidence): string {
  const parts: string[] = [];

  // Title is a strong signal
  if (evidence.title) parts.push(evidence.title);

  // 1. Prioritize Visible Text
  const visibleBlocks = evidence.blocks.filter(b => b.kind === "heading-section" || b.kind === "body-fallback");
  for (const b of visibleBlocks) {
    if (b.kind === "heading-section") parts.push(b.heading, b.bodyText);
    else if (b.kind === "body-fallback") parts.push(b.text);
  }

  // 2. Meta descriptions
  const meta = evidence.blocks.find((b): b is MetaEvidence => b.kind === "meta");
  if (meta) {
    if (meta.metaDescription) parts.push(meta.metaDescription);
    if (meta.ogDescription) parts.push(meta.ogDescription);
  }

  // 3. JSON-LD only if visible text is thin
  if (parts.join(" ").length < 300) {
    const jsonLd = evidence.blocks.filter((b): b is JsonLdEvidence => b.kind === "json-ld");
    for (const b of jsonLd) {
      if (b.parsed !== undefined) parts.push(JSON.stringify(b.parsed));
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Ensures an EvidenceItem has a usable snippet.
 * Prioritizes visible text and term-aware generation.
 */
export function ensureUsableSnippet(params: {
  snippet?: string;
  structured: StructuredPageEvidence;
  maxLen?: number;
  terms?: string[];
}): string {
  const { snippet, structured, maxLen = 200, terms = [] } = params;
  
  // Preferred sources in order
  const meta = structured.blocks.find((b): b is MetaEvidence => b.kind === "meta");
  const headings = structured.blocks.filter((b): b is HeadingSectionEvidence => b.kind === "heading-section");
  const body = structured.blocks.find((b): b is BodyFallbackEvidence => b.kind === "body-fallback");

  // If we have terms, try to find a window around them in visible text
  if (terms.length > 0) {
    const visibleText = headings.map(h => `${h.heading} ${h.bodyText}`).join(" ") + " " + (body?.text ?? "");
    const lowerText = visibleText.toLowerCase();
    
    for (const term of terms) {
      const idx = lowerText.indexOf(term.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 60);
        const end = Math.min(visibleText.length, idx + term.length + 100);
        let excerpt = visibleText.slice(start, end).trim();
        if (start > 0) excerpt = "..." + excerpt;
        if (end < visibleText.length) excerpt = excerpt + "...";
        return cap(excerpt, maxLen);
      }
    }
  }

  // Fallback 1: Heading/Meta
  if (meta?.metaDescription && meta.metaDescription.length > 50) return cap(meta.metaDescription, maxLen);
  if (headings.length > 0) {
    const h = headings[0];
    return cap(`${h.heading}: ${h.bodyText}`, maxLen);
  }
  if (body && body.text.length > 50) return cap(body.text, maxLen);

  // Fallback 2: existing snippet if it's okay
  if (snippet && snippet.length > 40 && !snippet.includes("{") && !snippet.includes('["')) {
    return cap(snippet, maxLen);
  }

  // Fallback 3: Usable text summary
  return cap(getUsableTextFromEvidence(structured), maxLen);
}

/**
 * Prefer rendered text when stronger; keep static JSON-LD when the SPA shell omitted it.
 */
export function mergeStructuredPageEvidence(
  staticEv: StructuredPageEvidence,
  renderedEv: StructuredPageEvidence,
): StructuredPageEvidence {
  const sLen = flattenEvidenceToText(staticEv).length;
  const rLen = flattenEvidenceToText(renderedEv).length;
  if (rLen === 0) return { ...staticEv, contentSource: staticEv.contentSource ?? "static" };

  const meta = mergeMetaBlocks(
    staticEv.blocks.find((b): b is MetaEvidence => b.kind === "meta"),
    renderedEv.blocks.find((b): b is MetaEvidence => b.kind === "meta"),
  );
  const jsonLd = dedupeJsonLdBlocks([
    ...renderedEv.blocks.filter((b): b is JsonLdEvidence => b.kind === "json-ld"),
    ...staticEv.blocks.filter((b): b is JsonLdEvidence => b.kind === "json-ld"),
  ]);

  const headR = renderedEv.blocks.filter((b): b is HeadingSectionEvidence => b.kind === "heading-section");
  const headS = staticEv.blocks.filter((b): b is HeadingSectionEvidence => b.kind === "heading-section");
  const headings = headR.length >= headS.length ? headR : headS;

  const bodyS = staticEv.blocks.find((b): b is BodyFallbackEvidence => b.kind === "body-fallback");
  const bodyR = renderedEv.blocks.find((b): b is BodyFallbackEvidence => b.kind === "body-fallback");
  let body: BodyFallbackEvidence | undefined;
  if (bodyS && bodyR) {
    body = {
      kind: "body-fallback",
      text: bodyR.text.length >= bodyS.text.length ? bodyR.text : bodyS.text,
    };
  } else {
    body = bodyR ?? bodyS;
  }

  const blocks: EvidenceBlock[] = [];
  if (meta) blocks.push(meta);
  blocks.push(...jsonLd);
  blocks.push(...headings);
  if (body) blocks.push(body);

  const contentSource: EvidenceContentSource = sLen >= 50 && rLen >= 50 ? "hybrid" : "rendered";

  return {
    url: staticEv.url,
    title: renderedEv.title || staticEv.title,
    pageType: staticEv.pageType,
    score: staticEv.score,
    blocks,
    sourceConfidence: computeSourceConfidence(blocks, staticEv.pageType),
    contentSource,
  };
}

// --- API summary + excerpt helpers ---

export function toPageEvidenceSummary(evidence: StructuredPageEvidence): PageEvidenceSummary {
  const evidenceKinds = Array.from(new Set(evidence.blocks.map((b) => b.kind))) as EvidenceKind[];
  const headingsCount = evidence.blocks.filter((b) => b.kind === "heading-section").length;
  const jsonLdTypes = evidence.blocks
    .filter((b): b is JsonLdEvidence => b.kind === "json-ld")
    .map((b) => b.type)
    .filter((t): t is string => !!t);

  return {
    url: evidence.url,
    title: evidence.title,
    pageType: evidence.pageType,
    score: evidence.score,
    sourceConfidence: evidence.sourceConfidence,
    ...(evidence.contentSource ? { contentSource: evidence.contentSource } : {}),
    evidenceKinds,
    headingsCount,
    jsonLdTypes,
  };
}

/** Returns a short human-readable excerpt from a block, suitable for a citation. */
export function excerptForBlock(block: EvidenceBlock): string | undefined {
  switch (block.kind) {
    case "meta":
      return cap(block.metaDescription || block.ogDescription || block.ogTitle || "", EXCERPT_CAP) || undefined;
    case "json-ld":
      return cap(block.parsed !== undefined ? JSON.stringify(block.parsed) : block.raw, EXCERPT_CAP);
    case "heading-section":
      return cap(`${block.heading}: ${block.bodyText}`, EXCERPT_CAP);
    case "body-fallback":
      return cap(block.text, EXCERPT_CAP);
  }
}

/**
 * Attempts to resolve a Signal.source string to a concrete evidence block.
 * Heuristics:
 *  1. URL substring match → pick the page whose URL appears in `source`.
 *  2. Within the chosen page, keyword match on evidence kind:
 *     - "json-ld" / "@type=" / "structured data" → json-ld block
 *     - "meta" / "description" / "og:" → meta block
 *     - a heading literal → heading-section block
 *  3. Otherwise pick the highest-trust block on that page
 *     (json-ld > meta > heading-section > body-fallback).
 *
 * Returns `undefined` when no page match is found — we never invent a match.
 */
export function resolveSignalCitation(
  source: string | undefined,
  pages: StructuredPageEvidence[],
): SignalCitation | undefined {
  if (!source || pages.length === 0) return undefined;
  const needle = source.toLowerCase();

  const page =
    pages.find((p) => needle.includes(p.url.toLowerCase())) ??
    pages.find((p) => {
      try {
        return needle.includes(new URL(p.url).pathname.toLowerCase());
      } catch {
        return false;
      }
    });
  if (!page) return undefined;

  let block: EvidenceBlock | undefined;

  if (/json[\s-]?ld|@type|structured\s+data/i.test(source)) {
    block = page.blocks.find((b) => b.kind === "json-ld");
  } else if (/meta|description|og:|og_description/i.test(source)) {
    block = page.blocks.find((b) => b.kind === "meta");
  } else {
    const headingMatch = page.blocks.find(
      (b): b is HeadingSectionEvidence =>
        b.kind === "heading-section" && needle.includes(b.heading.toLowerCase()),
    );
    if (headingMatch) block = headingMatch;
  }

  if (!block) {
    const priority: EvidenceKind[] = ["json-ld", "meta", "heading-section", "body-fallback"];
    for (const kind of priority) {
      const hit = page.blocks.find((b) => b.kind === kind);
      if (hit) {
        block = hit;
        break;
      }
    }
  }
  if (!block) return undefined;

  return {
    pageUrl: page.url,
    pageType: page.pageType,
    evidenceKind: block.kind,
    excerpt: excerptForBlock(block),
  };
}
