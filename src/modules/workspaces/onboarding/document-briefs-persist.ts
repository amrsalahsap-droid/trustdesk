import { type DocumentBrief } from "./document-brief-types";

/** Bump when DocumentBrief shape or semantics change (replay / debugging). */
export const DOCUMENT_BRIEF_SCHEMA_VERSION = "2026-04-22-v2";

export type DocumentBriefsPersistedV2 = {
  briefSchemaVersion: string;
  updatedAt: string;
  briefs: Record<string, DocumentBrief>;
};

function isBriefShape(v: unknown): v is DocumentBrief {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string";
}

/**
 * Reads workspace.documentBriefsJson whether stored as a flat map (legacy)
 * or wrapped {@link DocumentBriefsPersistedV2}.
 */
export function parseDocumentBriefsJson(json: unknown): Record<string, DocumentBrief> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const o = json as Record<string, unknown>;
  if ("briefs" in o && o.briefs && typeof o.briefs === "object" && !Array.isArray(o.briefs)) {
    return o.briefs as Record<string, DocumentBrief>;
  }
  const out: Record<string, DocumentBrief> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "briefSchemaVersion" || k === "updatedAt") continue;
    if (isBriefShape(v)) out[k] = v;
  }
  return out;
}

export function wrapBriefsForPersist(briefs: Record<string, DocumentBrief>): DocumentBriefsPersistedV2 {
  return {
    briefSchemaVersion: DOCUMENT_BRIEF_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    briefs,
  };
}
