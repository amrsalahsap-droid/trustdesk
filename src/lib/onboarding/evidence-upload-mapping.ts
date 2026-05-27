/**
 * Maps onboarding recommendation IDs and upload modal hints to orchestration document-type hints.
 * Used client + server so CTAs stay consistent.
 */

/** Canonical recommendation ids from recommendation-orchestrator (evidence_uploads). */
export const RECOMMENDATION_ID_TO_TYPE_HINT: Record<string, string> = {
  upload_infosec_policy: "security_policy",
  upload_privacy_policy: "privacy_policy",
  upload_dpa: "dpa",
  upload_bc_dr_plan: "bc_dr_plan",
  upload_soc2_certificate: "soc2_report",
  upload_iso_certificate: "iso27001_certificate",
  upload_pen_test: "penetration_test",
  upload_architecture_diagram: "architecture_diagram",
};

/** Keys used by EvidenceUploadModal labels / CTAs */
export const MODAL_DOCUMENT_TYPE_KEYS = [
  "upload_infosec_policy",
  "upload_privacy_policy",
  "upload_dpa",
  "upload_access_control",
  "upload_bc_dr_plan",
  "upload_soc2_certificate",
  "upload_iso_certificate",
  "upload_pen_test",
  "upload_architecture_diagram",
] as const;

export type ModalDocumentTypeKey = (typeof MODAL_DOCUMENT_TYPE_KEYS)[number];

export const MODAL_KEY_DISPLAY: Record<string, string> = {
  upload_infosec_policy: "Information Security Policy",
  upload_privacy_policy: "Privacy Policy",
  upload_dpa: "Data Processing Addendum (DPA)",
  upload_access_control: "Access Control Policy",
  upload_bc_dr_plan: "Business Continuity & DR Plan",
  upload_soc2_certificate: "SOC 2 Report",
  upload_iso_certificate: "ISO 27001 Certificate",
  upload_pen_test: "Penetration Test Report",
  upload_architecture_diagram: "Architecture Diagram",
};

/**
 * Normalize arbitrary UI input (recommendation id, modal key, or human title) to an orchestration type hint.
 */
export function resolveUploadTypeHint(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (RECOMMENDATION_ID_TO_TYPE_HINT[trimmed]) {
    return RECOMMENDATION_ID_TO_TYPE_HINT[trimmed];
  }
  if (trimmed.startsWith("upload_") && RECOMMENDATION_ID_TO_TYPE_HINT[trimmed]) {
    return RECOMMENDATION_ID_TO_TYPE_HINT[trimmed];
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes("information security") && lower.includes("policy")) return "security_policy";
  if (lower.includes("privacy policy")) return "privacy_policy";
  if (lower.includes("dpa") || lower.includes("data processing")) return "dpa";
  if (lower.includes("business continuity") || lower.includes("bc/dr") || lower.includes("disaster recovery"))
    return "bc_dr_plan";
  if (lower.includes("soc") && lower.includes("2")) return "soc2_report";
  if (lower.includes("iso") && lower.includes("27001")) return "iso27001_certificate";
  if (lower.includes("penetration") || lower.includes("pen test")) return "penetration_test";
  if (lower.includes("architecture")) return "architecture_diagram";
  return undefined;
}

export function displayLabelForUploadHint(key?: string | null): string {
  if (!key) return "Document";
  if (MODAL_KEY_DISPLAY[key]) return MODAL_KEY_DISPLAY[key];
  return key.replace(/^upload_/i, "").replaceAll("_", " ");
}
