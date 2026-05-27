import { createHash } from "crypto";
import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { DOCUMENT_BRIEF_SCHEMA_VERSION, parseDocumentBriefsJson } from "./document-briefs-persist";
import { type DocumentBrief } from "./document-brief-types";

export const ONBOARDING_INTEL_SNAPSHOT_VERSION = 1;

export type OnboardingIntelDocBriefMeta = {
  docId: string;
  briefStatus?: string;
  tailoringConfidenceSnapshot?: number;
  updatedAt: string;
};

export type OnboardingIntelMetaSnapshot = {
  version: number;
  updatedAt: string;
  analysisStatus: "confirmed_profile" | "profile_only";
  analyzedAt?: string;
  pagesScanned?: string[];
  profileFingerprint: string;
  deepProfileFingerprint: string;
  briefSchemaVersion: string;
  documentBriefs: OnboardingIntelDocBriefMeta[];
  tailoringConfidence?: number;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function fingerprintJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 32);
}

function extractPagesScanned(deep: unknown): string[] {
  if (!deep || typeof deep !== "object" || Array.isArray(deep)) return [];
  const p = (deep as { pagesScanned?: string[] }).pagesScanned;
  return Array.isArray(p) ? p.slice(0, 200) : [];
}

function extractTailoringConfidence(deep: unknown): number | undefined {
  if (!deep || typeof deep !== "object" || Array.isArray(deep)) return undefined;
  const t = (deep as { tailoringConfidence?: number }).tailoringConfidence;
  return typeof t === "number" ? t : undefined;
}

export class OnboardingIntelService {
  static async persistSnapshotAfterProfileSave(params: {
    workspaceId: string;
    hasDeepProfileWrite: boolean;
    tailoringConfidence?: number;
  }): Promise<void> {
    const ws = await prisma.workspace.findUnique({
      where: { id: params.workspaceId },
      select: {
        industry: true,
        productType: true,
        customerSegment: true,
        dataTypes: true,
        complianceTargets: true,
        deepProfileJson: true,
        documentBriefsJson: true,
      },
    });
    if (!ws) return;

    const confirmed = {
      industry: ws.industry,
      productType: ws.productType,
      customerSegment: ws.customerSegment,
      dataTypes: ws.dataTypes,
      complianceTargets: ws.complianceTargets,
    };
    const profileFingerprint = fingerprintJson(confirmed);
    const deepProfileFingerprint = fingerprintJson(ws.deepProfileJson ?? null);

    const briefs = parseDocumentBriefsJson(ws.documentBriefsJson);
    const documentBriefs: OnboardingIntelDocBriefMeta[] = Object.entries(briefs).map(([docId, b]) => ({
      docId,
      briefStatus: (b as DocumentBrief).status,
      tailoringConfidenceSnapshot:
        params.tailoringConfidence ?? extractTailoringConfidence(ws.deepProfileJson),
      updatedAt: new Date().toISOString(),
    }));

    const snapshot: OnboardingIntelMetaSnapshot = {
      version: ONBOARDING_INTEL_SNAPSHOT_VERSION,
      updatedAt: new Date().toISOString(),
      analysisStatus: params.hasDeepProfileWrite ? "confirmed_profile" : "profile_only",
      analyzedAt: params.hasDeepProfileWrite ? new Date().toISOString() : undefined,
      pagesScanned: extractPagesScanned(ws.deepProfileJson),
      profileFingerprint,
      deepProfileFingerprint,
      briefSchemaVersion: DOCUMENT_BRIEF_SCHEMA_VERSION,
      documentBriefs,
      tailoringConfidence:
        params.tailoringConfidence ?? extractTailoringConfidence(ws.deepProfileJson),
    };

    await prisma.workspace.update({
      where: { id: params.workspaceId },
      data: { onboardingIntelMetaJson: snapshot as unknown as Prisma.InputJsonValue },
    });
  }

  static async getSnapshot(workspaceId: string): Promise<OnboardingIntelMetaSnapshot | null> {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { onboardingIntelMetaJson: true },
    });
    const j = ws?.onboardingIntelMetaJson;
    if (!j || typeof j !== "object" || Array.isArray(j)) return null;
    return j as unknown as OnboardingIntelMetaSnapshot;
  }
}
