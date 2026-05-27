import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { prisma } from "@/lib/db/prisma";
import {
  aggregateContradictionExportGate,
  buildContradictionExportNotices,
  classifyContradictionForExport,
  mediumExportPolicyFromDb,
  type ContradictionExportRowInput,
  type ContradictionMediumExportPolicy,
} from "@/modules/questionnaires/export-contradiction-policy";
import {
  normalizeMinReviewedPercent,
  resolveCompletenessGating,
  unansweredExportPolicyFromDb,
  type UnansweredExportPolicy,
} from "@/modules/questionnaires/export-completeness-policy";
import { QuestionnaireExportError } from "@/modules/questionnaires/errors";
import { uploadObject } from "@/lib/storage/storage-service";
import { requireStorageConfig } from "@/lib/storage/storage-env";
import { logger } from "@/lib/logging/logger";
import { isEligibleForExportReuse } from "@/lib/knowledge/answer-workflow";
import { freshnessBucket } from "@/lib/knowledge/answer-freshness";
import { reviewedRowUsesSuggestedLibraryText } from "@/lib/knowledge/answer-export-safety";
import type { ContradictionResolutionStatus } from "@/lib/contradiction/persistence-types";
import { getRowState, hasAnswerContext, COMMITTED_VERIFICATION_STATUSES } from "@/lib/questionnaires/row-state";

type ItemContradictionSlice = {
  type: string;
  finalAnswer?: string | null;
  suggestedAnswer?: string | null;
  suggestedAnswerId?: string | null;
  contradictionResult: ContradictionExportRowInput | null;
};


function assertContradictionExportAllowedForItems(
  items: ItemContradictionSlice[],
  mediumPolicy: ContradictionMediumExportPolicy,
): void {
  const questionRows = items.filter(
    (i) => i.type === "question_row" && hasAnswerContext(i as any),
  );
  const agg = aggregateContradictionExportGate(
    questionRows.map((i) => i.contradictionResult),
    mediumPolicy,
  );
  if (agg.blocksExport) {
    throw QuestionnaireExportError.contradictionBlocksExport();
  }
}

/**
 * Hard-blocks the download endpoints when workspace policy (or the min-reviewed-percent
 * threshold) would reject an incomplete questionnaire. Throws 409
 * `EXPORT_COMPLETENESS_POLICY_VIOLATED` so `getReadiness` and the download endpoints
 * share a single source of truth.
 */
function assertExportCompletenessAllowedForItems(args: {
  items: Array<{ type: string; reviewed: boolean }>;
  policy: UnansweredExportPolicy;
  minReviewedPercent: number | null;
}): void {
  const questionRows = args.items.filter((i) => i.type === "question_row");
  const total = questionRows.length;
  const reviewed = questionRows.filter((i) => i.reviewed).length;
  const gating = resolveCompletenessGating({
    policy: args.policy,
    minReviewedPercent: args.minReviewedPercent,
    total,
    reviewed,
  });
  if (gating !== "block") return;
  const unanswered = Math.max(0, total - reviewed);
  if (args.minReviewedPercent !== null) {
    const coverage = total > 0 ? (reviewed / total) * 100 : 0;
    if (coverage < args.minReviewedPercent) {
      throw QuestionnaireExportError.completenessPolicyViolated({
        kind: "min_reviewed_percent",
        threshold: args.minReviewedPercent,
        coverage,
        unanswered,
      });
    }
  }
  throw QuestionnaireExportError.completenessPolicyViolated({
    kind: "policy",
    unanswered,
  });
}

async function buildAnswerExportEligibilityMap(
  workspaceId: string,
  answerIds: string[],
): Promise<Map<string, boolean>> {
  const unique = [...new Set(answerIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.answerLibraryItem.findMany({
    where: { workspaceId, id: { in: unique } },
    select: {
      id: true,
      status: true,
      governanceStatus: true,
      approvalScope: true,
      exportSafe: true,
      nextReviewDueAt: true,
    },
  });
  const m = new Map<string, boolean>();
  for (const r of rows) {
    m.set(r.id, isEligibleForExportReuse(r));
  }
  return m;
}

/**
 * For an unreviewed row that is eligible for `includeUnresolved` export, picks the
 * best fallback answer text to emit.
 *
 * Precedence (most trusted → least):
 *   1. `importedAnswer` — the customer's uploaded manual answer. This is a user
 *      assertion, so it wins over an AI draft the reviewer never endorsed.
 *   2. `suggestedAnswer` — AI draft, gated by export-safety of the linked library
 *      answer (`suggestedAnswerId`). When the linked answer is not export-safe, we
 *      emit `""` to clear the cell rather than leaking internal-only text.
 *
 * Returns:
 *   - `null`  when no fallback should be emitted (row is reviewed, not in unresolved
 *             mode, or has no fallback text at all).
 *   - `""`    when we want to explicitly clear the cell (library-blocked suggestion).
 *   - string  the chosen fallback.
 */
function exportGatedFallbackText(
  item: {
    importedAnswer: string | null;
    suggestedAnswer: string | null;
    suggestedAnswerId: string | null;
    reviewed: boolean;
  },
  includeUnresolved: boolean,
  eligibility: Map<string, boolean>,
): string | null {
  if (!includeUnresolved) return null;
  if (item.reviewed) return null;
  const importedRaw = (item.importedAnswer ?? "").trim();
  if (importedRaw) return importedRaw;
  const suggestedRaw = (item.suggestedAnswer ?? "").trim();
  if (!suggestedRaw) return null;
  if (!item.suggestedAnswerId) return suggestedRaw;
  return eligibility.get(item.suggestedAnswerId) ? suggestedRaw : "";
}

export interface ExportOptions {
  includeUnresolved?: boolean;
  /**
   * When true, reviewed rows that still match the library suggestion omit text
   * if the linked answer is not export-eligible. Defaults from workspace
   * `questionnaireExportStrictBuyerMode` when omitted.
   */
  strictBuyerExport?: boolean;
}

/**
 * Categories of problem the export UI may surface. Each category maps to a section in
 * the blockers card; some have row-level detail, some are questionnaire-level.
 */
export type ExportBlockerKind =
  | "contradiction"
  | "non_export_safe_library_answer"
  | "export_scope_blocked_suggestion"
  | "stale_suggested_answer"
  | "xlsx_unavailable"
  | "macro_source"
  /** Row has no answer content and has not been reviewed. Coverage gate. */
  | "unanswered_row"
  /** Row has an AI-drafted suggestion but the user has not committed to it yet. */
  | "uncommitted_suggestion"
  /** Row has an unresolved evidence-level conflict (distinct from canonical contradiction). */
  | "evidence_conflict"
  | "verified_empty"
  | "missing_selection_source";

export type ExportBlockerSeverity = "critical" | "high" | "medium" | "low" | "info" | null;

/**
 * A single row surfaced inside an {@link ExportBlockerCategory}. Lets the UI deep-link
 * the user from the export page back to the exact problematic row in review.
 */
export interface ExportBlockerRow {
  questionnaireItemId: string;
  rowNumber: number | null;
  questionPreview: string;
  topicName: string | null;
  severity: ExportBlockerSeverity;
  contradictionType: string | null;
  resolutionStatus: ContradictionResolutionStatus | null;
  message: string | null;
  /**
   * For `unanswered_row` and `uncommitted_suggestion`, the item-level unresolved reason
   * (`missing_topic`, `no_approved_answer`, `low_confidence`, `no_evidence`, or any code
   * the matcher writes) so the UI can explain WHY the row is unresolved rather than
   * just that it is. Null for other categories.
   */
  unresolvedReason: string | null;
  /** App-relative deep link back to the review screen focused on this row. */
  reviewDeepLink: string;
}

/**
 * Grouped export problem — `rows` is empty for questionnaire-level issues like
 * "XLSX source unavailable" or "macro-enabled source".
 */
export interface ExportBlockerCategory {
  kind: ExportBlockerKind;
  gating: "block" | "warn";
  title: string;
  description: string;
  count: number;
  rows: ExportBlockerRow[];
}

export type ExportReadinessVerdict = "ready" | "ready_with_warnings" | "needs_review" | "incomplete" | "blocked";

export interface ExportSummary {
  verdict: ExportReadinessVerdict;
  title: string;
  message: string;
  blockerCount: number;
  warningCount: number;
  /** True only when verdict is 'ready' or 'ready_with_warnings'. */
  canExport: boolean;
}

export interface ExportReadiness {
  xlsxAvailable: boolean;
  csvAvailable: boolean;
  originalFileName: string | null;
  reason: string | null;
  /** True when the source workbook is macro-enabled (.xlsm). */
  macroSource: boolean;
  /**
   * Human-readable fidelity warning. Populated only when the exporter cannot
   * preserve the source format losslessly (e.g. macros in an .xlsm file will
   * be dropped because SheetJS only writes .xlsx).
   */
  formatNotice: string | null;
  /**
   * Names of all sheets in the source workbook (D12-US-02). Used by the UI to
   * show the user exactly what will be preserved. Empty when the source is
   * unavailable.
   */
  sheetNames: string[];
  /** Sheet into which approved answers will be written. */
  targetSheetName: string | null;
  counts: {
    total: number;
    reviewed: number;
    accepted: number;
    rejected: number;
    unresolved: number;
  };
  /** Granular question counts for transparency. */
  totalQuestions: number;
  readyQuestions: number;
  answeredReadyQuestions: number;
  unansweredQuestions: number;
  suggestedButUnconfirmedQuestions: number;
  verifiedEmptyQuestions: number;
  blockedQuestions: number;
  warningQuestions: number;
  completenessPercentage: number;
  /** Primary signal for export availability. */
  canExport: boolean;
  /** Precedence-aware status string. */
  readinessLabel: ExportReadinessVerdict;
  summary: ExportSummary;
  /**
   * Unreviewed rows whose suggested answer comes from the library but the
   * linked answer is not approved for export — omitted when exporting with
   * unresolved rows included.
   */
  exportScopeBlockedSuggestions: number;
  /** Human-readable notice when exportScopeBlockedSuggestions > 0. */
  exportScopeNotice: string | null;
  /** Unresolved rows whose linked library answer is stale or expired for export handoff. */
  staleSuggestedAnswerCount: number;
  staleSuggestedAnswerNotice: string | null;
  /** Workspace default for strict buyer export (reviewed + library text gate). */
  questionnaireExportStrictBuyerMode: boolean;
  /** Reviewed rows whose final text still matches the suggestion and the linked answer is export-eligible. */
  reviewedRowsBackedByExportSafeLibrary: number;
  /** Reviewed rows still mirroring library text where the linked answer is not export-eligible. */
  reviewedRowsBackedByNonExportLibrary: number;
  /** Reviewed rows with no library link or with custom final text differing from the suggestion. */
  reviewedRowsCustomOrNoLibraryLink: number;
  /** Shown when strict mode would blank reviewed cells tied to non-export-safe library answers. */
  buyerExportNotice: string | null;
  /** True when unresolved contradictions block export per workspace policy. */
  contradictionExportBlocked: boolean;
  contradictionBlockingRowCount: number;
  contradictionWarningRowCount: number;
  contradictionExportNotice: string | null;
  contradictionExportWarnNotice: string | null;
  questionnaireExportContradictionMediumPolicy: ContradictionMediumExportPolicy;
  /** Workspace policy for questionnaire completeness (IGNORE/WARN/BLOCK). */
  questionnaireExportUnansweredPolicy: UnansweredExportPolicy;
  /** Optional 0-100 threshold; when reviewed coverage is below it, completeness hard-blocks. */
  questionnaireExportMinReviewedPercent: number | null;
  /** True when the completeness policy (either enum BLOCK or min-percent) would reject export. */
  completenessExportBlocked: boolean;
  /** Count of unanswered rows contributing to the completeness category (may be 0 even when blocked via min-percent if all rows have AI drafts). */
  unansweredRowCount: number;
  /** Count of rows whose AI-drafted suggestion has not been committed. */
  uncommittedSuggestionRowCount: number;
  /** Count of rows with an evidence-level conflict the reviewer has not resolved. */
  evidenceConflictRowCount: number;
  /**
   * Structured, row-level view of every export problem. The export UI should render
   * from this rather than parsing human-readable notice strings — `blockers` can
   * include no-op categories (e.g. contradictionExportWarnNotice as `gating: "warn"`)
   * so users can jump directly to every affected row.
   */
  blockers: ExportBlockerCategory[];
}

interface ExportResult {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  jobId: string;
  storageKey: string;
}


const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv; charset=utf-8";

function slugify(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "_").toLowerCase().replace(/^_+|_+$/g, "") || "questionnaire";
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripExtension(name: string): string {
  return name.replace(/\.(xlsx|xlsm|xls|csv)$/i, "");
}

const XLSM_MIME = "application/vnd.ms-excel.sheet.macroenabled.12";
const XLSM_FORMAT_NOTICE =
  "The source file is macro-enabled (.xlsm). Macros and VBA will not be preserved in the exported .xlsx; the original upload is not modified.";

/**
 * Detects macro-enabled workbooks so the UI can warn the user that the
 * exported .xlsx will not carry macros/VBA forward.
 */
function isMacroEnabledSource(job: {
  mimeType: string | null;
  originalName: string | null;
}): boolean {
  const mt = (job.mimeType ?? "").toLowerCase();
  const name = (job.originalName ?? "").toLowerCase();
  return mt === XLSM_MIME || name.endsWith(".xlsm");
}

/**
 * Safely reads `sheetNames` out of the job's stored previewJson, which is
 * untyped. Returns an empty array when the shape doesn't match.
 */
function extractSheetNamesFromPreview(previewJson: unknown): string[] {
  if (!previewJson || typeof previewJson !== "object") return [];
  const candidate = (previewJson as Record<string, unknown>).sheetNames;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((s): s is string => typeof s === "string");
}

/**
 * Reads the uploaded source workbook using SheetJS. SheetJS handles both the
 * standard default-namespace OOXML form and the `x:`-prefixed form that some
 * non-Microsoft generators emit (which ExcelJS cannot parse).
 */
function readWorkbook(fileBytes: unknown): XLSX.WorkBook {
  const buf = Buffer.from(fileBytes as Uint8Array);
  return XLSX.read(buf, { type: "buffer", cellStyles: true });
}

/**
 * Strips legacy comments (notes) and data validation from all sheets in the
 * workbook. This prevents 'giant green box' artifacting in the exported file
 * caused by SheetJS's imperfect handling of these features during re-write.
 */
function stripMetadata(wb: XLSX.WorkBook): void {
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;

    // Remove sheet-level validation
    delete ws["!dataValidation"];

    // Remove cell-level comments
    for (const addr in ws) {
      if (addr[0] === "!") continue;
      const cell = ws[addr];
      if (cell && typeof cell === "object") {
        delete cell.c; // Legacy comments
      }
    }
  }
}

/**
 * Normalizes an XLSX buffer by stripping non-standard XML namespace prefixes
 * (specifically "x:") from xl/workbook.xml. This addresses a known issue where
 * ExcelJS fails to parse spreadsheets generated by some tools (e.g. Google Sheets)
 * that use the x: prefix for standard OOXML elements.
 */
/**
 * Converts an absolute OPC package path (e.g. "/xl/styles.xml") into a path
 * relative to the directory that the .rels file sits under. OOXML allows both
 * absolute and relative Target attributes, but ExcelJS's target resolver
 * joins them with its own base directory and fails for absolute paths,
 * producing `undefined` lookups that later crash the workbook model setter
 * with "Cannot read properties of undefined (reading 'name')".
 */
function absoluteToRelative(absoluteTarget: string, relsFilePath: string): string {
  if (!absoluteTarget.startsWith("/")) return absoluteTarget;
  const m = relsFilePath.match(/^(.*?)_rels\/[^/]+\.rels$/i);
  const containerDir = m ? m[1] : ""; // "xl/" or "xl/worksheets/" or ""
  const absPath = absoluteTarget.slice(1); // drop leading "/"

  const containerParts = containerDir.split("/").filter(Boolean);
  const targetParts = absPath.split("/");
  let i = 0;
  while (
    i < containerParts.length &&
    i < targetParts.length &&
    containerParts[i] === targetParts[i]
  ) {
    i++;
  }
  const up = "../".repeat(containerParts.length - i);
  const down = targetParts.slice(i).join("/");
  return up + down || ".";
}

async function normalizeWorkbook(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let modified = false;


  // ExcelJS fails to parse spreadsheets where OOXML namespaces use the 'x:' prefix.
  // This occurs in files generated by some third-party tools (e.g. Google Sheets).
  // We iterate through all XML files in the package and strip the prefix.
  const xmlFiles = Object.keys(zip.files).filter((path) => path.endsWith(".xml"));

  for (const path of xmlFiles) {
    const file = zip.file(path);
    if (!file) continue;

    const originalXml = await file.async("string");

    // Check if this specific XML file uses the x: prefix.
    if (originalXml.includes("xmlns:x=")) {
      // Robustly strip x: prefix and fix the namespace definitions.
      // We target element start/end tags and the namespace declaration itself.
      const normalizedXml = originalXml
        .replace(/<x:(\w+)/g, "<$1")
        .replace(/<\/x:(\w+)>/g, "</$1>")
        .replace(
          /xmlns:x="http:\/\/schemas\.openxmlformats\.org\/spreadsheetml\/2006\/main"/g,
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        );

      zip.file(path, normalizedXml);
      modified = true;
    }
  }

  // Rewrite absolute rels Target attributes to relative paths. Some generators
  // (e.g. SheetJS-compatible emitters) write Target="/xl/styles.xml" instead
  // of Target="styles.xml". ExcelJS's target resolver joins them with its own
  // base dir and ends up looking at the wrong zip key, producing undefined
  // lookups that later crash the workbook setter with ".name of undefined".
  const allRelsPaths = Object.keys(zip.files).filter((p) => /\.rels$/i.test(p));
  for (const rp of allRelsPaths) {
    const relFile = zip.file(rp);
    if (!relFile) continue;
    const original = await relFile.async("string");
    if (!/Target="\//i.test(original)) continue;
    const rewritten = original.replace(
      /(<Relationship\b[^>]*\bTarget=")(\/[^"]*)(")/gi,
      (_m, lhs: string, absTarget: string, rhs: string) =>
        lhs + absoluteToRelative(absTarget, rp) + rhs,
    );
    if (rewritten !== original) {
      zip.file(rp, rewritten);
      modified = true;
    }
  }

  // Strip dangling <Relationship> entries: any rel whose Target doesn't resolve
  // to an actual zip entry. Some third-party generators leave references to
  // comments/vmlDrawing/drawings that don't exist in the package. ExcelJS
  // tolerates these but Microsoft Excel treats them as corruption and refuses
  // to open the file ("cannot be accessed").
  const zipEntries = new Set(Object.keys(zip.files));
  const resolveTargetAgainstRels = (target: string, relsPath: string): string => {
    const m = relsPath.match(/^(.*?)_rels\/[^/]+\.rels$/i);
    const baseDir = m ? m[1] : "";
    const parts = (baseDir + target).split("/");
    const stack: string[] = [];
    for (const seg of parts) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") stack.pop();
      else stack.push(seg);
    }
    return stack.join("/");
  };
  for (const rp of allRelsPaths) {
    const relFile = zip.file(rp);
    if (!relFile) continue;
    const original = await relFile.async("string");
    const cleaned = original.replace(
      /<Relationship\b[^>]*\/>/gi,
      (match) => {
        const targetMatch = /\bTarget="([^"]+)"/i.exec(match);
        if (!targetMatch) return match;
        const target = targetMatch[1];
        if (/^https?:/i.test(target)) return match;
        const resolved = resolveTargetAgainstRels(target, rp);
        if (zipEntries.has(resolved)) return match;
        return "";
      },
    );
    if (cleaned !== original) {
      zip.file(rp, cleaned);
      modified = true;
    }
  }

  // Strip comment-related parts that ExcelJS cannot parse without crashing
  // with "Cannot read properties of undefined (reading 'comments')".
  // Also strip legacy VML comment shapes so their dangling rels don't
  // re-trigger the same class of bug.
  const commentPaths = Object.keys(zip.files).filter(
    (p) =>
      /^xl\/comments[^/]*\.xml$/i.test(p) ||
      /^xl\/threadedComments\//i.test(p) ||
      /^xl\/drawings\/vmlDrawing[^/]*\.vml$/i.test(p),
  );
  for (const p of commentPaths) {
    zip.remove(p);
    modified = true;
  }


  if (commentPaths.length > 0) {
    // Remove <Override> entries for stripped parts from [Content_Types].xml
    const ctFile = zip.file("[Content_Types].xml");
    if (ctFile) {
      let ct = await ctFile.async("string");
      for (const p of commentPaths) {
        const partName = "/" + p;
        ct = ct.replace(
          new RegExp(`<Override[^>]*PartName="${escapeRegex(partName)}"[^>]*/?>`, "gi"),
          "",
        );
      }
      zip.file("[Content_Types].xml", ct);
    }

    // Remove <Relationship> entries pointing at stripped parts from any .rels
    // file in the package. Sheet-level rels live at xl/worksheets/_rels/*.rels
    // and use relative Target paths (e.g. ../comments1.xml), so match by the
    // part's basename rather than its full path.
    const relPaths = Object.keys(zip.files).filter((p) => /\.rels$/i.test(p));
    for (const rp of relPaths) {
      const relFile = zip.file(rp);
      if (!relFile) continue;
      let rel = await relFile.async("string");
      for (const cp of commentPaths) {
        const basename = cp.split("/").pop()!;
        rel = rel.replace(
          new RegExp(
            `<Relationship[^>]*Target="[^"]*${escapeRegex(basename)}"[^>]*/?>`,
            "gi",
          ),
          "",
        );
      }
      zip.file(rp, rel);
    }

  }

  // Unconditionally strip <legacyDrawing> / <legacyDrawingHF> from every sheet
  // XML. These tags only wire worksheets to legacy comment VML shapes, and if
  // any referenced rel has been removed (or was never present), Microsoft
  // Excel treats the dangling rId as corruption and refuses to open the file.
  const sheetPaths = Object.keys(zip.files).filter((p) =>
    /^xl\/worksheets\/sheet[^/]*\.xml$/i.test(p),
  );
  for (const sp of sheetPaths) {
    const sheetFile = zip.file(sp);
    if (!sheetFile) continue;
    const original = await sheetFile.async("string");
    const cleaned = original
      .replace(/<legacyDrawing\s[^/]*\/>/gi, "")
      .replace(/<legacyDrawingHF\s[^/]*\/>/gi, "");
    if (cleaned !== original) {
      zip.file(sp, cleaned);
      modified = true;
    }
  }

  return modified ? zip.generateAsync({ type: "nodebuffer" }) : buffer;
}


type BlockerRowInput = {
  id: string;
  rowNumber: number | null;
  question: string;
  topicName: string | null;
  finalAnswer: string | null;
  suggestedAnswer: string | null;
  suggestedAnswerId: string | null;
  reviewed: boolean;
  /** `QuestionnaireItem.unresolvedReason` — used to annotate unanswered rows in blockers. */
  unresolvedReason: string | null;
  /** `QuestionnaireItem.verificationStatus` — decides whether a suggestion is user-committed. */
  verificationStatus: string | null;
  /** `QuestionnaireItem.reviewStatus` — "ok" / "missing" / "conflict" (evidence-level). */
  reviewStatus: string | null;
  /** `QuestionnaireItem.conflictNote` — evidence-level explanation when reviewStatus === "conflict". */
  conflictNote: string | null;
  contradictionResult: {
    contradictionFound: boolean;
    severity: string | null;
    resolutionStatus: ContradictionResolutionStatus;
    message: string | null;
    contradictionType: string | null;
  } | null;
};

type AnswerEligibilityInput = {
  id: string;
  status: string;
  governanceStatus: string;
  approvalScope: string;
  exportSafe: boolean;
  nextReviewDueAt: Date | null;
};

/**
 * Collapses whitespace and truncates row question text for compact blocker displays.
 * Kept identical between contradiction and non-contradiction row summaries so the UI
 * never renders a multi-line wall of text inside the blockers card.
 */
function buildQuestionPreview(question: string): string {
  const normalized = (question ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  return normalized.slice(0, 179) + "…";
}

function normalizeSeverityValue(severity: string | null): ExportBlockerSeverity {
  if (!severity) return null;
  const s = severity.trim().toLowerCase();
  if (s === "critical" || s === "high" || s === "medium" || s === "low" || s === "info") {
    return s;
  }
  return null;
}

function buildReviewDeepLink(questionnaireId: string, itemId: string): string {
  return `/app/questionnaires/${questionnaireId}/review?itemId=${encodeURIComponent(itemId)}#contradiction`;
}

function toBlockerRow(args: {
  questionnaireId: string;
  item: BlockerRowInput;
  severity: ExportBlockerSeverity;
  resolutionStatus: ContradictionResolutionStatus | null;
  message: string | null;
  contradictionType: string | null;
  /** Only populated for completeness-style categories (unanswered / uncommitted). */
  unresolvedReason?: string | null;
}): ExportBlockerRow {
  return {
    questionnaireItemId: args.item.id,
    rowNumber: args.item.rowNumber ?? null,
    questionPreview: buildQuestionPreview(args.item.question),
    topicName: args.item.topicName ?? null,
    severity: args.severity,
    contradictionType: args.contradictionType,
    resolutionStatus: args.resolutionStatus,
    message: args.message,
    unresolvedReason: args.unresolvedReason ?? null,
    reviewDeepLink: buildReviewDeepLink(args.questionnaireId, args.item.id),
  };
}

function sortBlockerRows(a: ExportBlockerRow, b: ExportBlockerRow): number {
  const ar = a.rowNumber ?? Number.MAX_SAFE_INTEGER;
  const br = b.rowNumber ?? Number.MAX_SAFE_INTEGER;
  if (ar !== br) return ar - br;
  return a.questionnaireItemId.localeCompare(b.questionnaireItemId);
}

/**
 * Builds the structured `blockers` list surfaced on the export screen. Each entry is a
 * category (contradictions, non-export-safe library, stale suggestions, etc.) with an
 * optional row-level breakdown so the UI can deep-link users to the exact problem.
 */
function buildExportBlockerCategories(args: {
  questionnaireId: string;
  /** Question rows eligible to contribute to the contradiction gate (non-empty). */
  items: BlockerRowInput[];
  /** All question rows (including empty ones) — needed for non-contradiction categories. */
  allQuestionRows: BlockerRowInput[];
  mediumPolicy: ContradictionMediumExportPolicy;
  strictBuyerMode: boolean;
  eligibility: Map<string, boolean>;
  staleById: Map<string, AnswerEligibilityInput>;
  now: Date;
  xlsxAvailable: boolean;
  xlsxUnavailableReason: string | null;
  macroSource: boolean;
  formatNotice: string | null;
  contradictionBlockingRowCount: number;
  contradictionWarningRowCount: number;
  exportScopeBlockedSuggestions: number;
  staleSuggestedAnswerCount: number;
  reviewedRowsBackedByNonExportLibrary: number;
  buyerExportNotice: string | null;
  /** Effective completeness gating resolved from policy + min-reviewed-percent. */
  completenessGating: "block" | "warn" | "none";
  /** Workspace policy enum value (unchanged by min-percent resolution). */
  unansweredPolicy: UnansweredExportPolicy;
  /** Non-null when the workspace configured a coverage threshold. */
  minReviewedPercent: number | null;
  /** Questionnaire-wide coverage (0-100) for threshold messaging. */
  reviewedCoveragePercent: number;
}): ExportBlockerCategory[] {
  const out: ExportBlockerCategory[] = [];

  // --- Contradictions: split into block (gates export) and warn (review before export)
  const contradictionBlockRows: ExportBlockerRow[] = [];
  const contradictionWarnRows: ExportBlockerRow[] = [];
  for (const item of args.items) {
    const cr = item.contradictionResult;
    if (!cr) continue;
    const cls = classifyContradictionForExport(cr, args.mediumPolicy);
    if (cls === "none") continue;
    const row = toBlockerRow({
      questionnaireId: args.questionnaireId,
      item,
      severity: normalizeSeverityValue(cr.severity),
      resolutionStatus: cr.resolutionStatus,
      message: cr.message ?? null,
      contradictionType: cr.contradictionType ?? null,
    });
    if (cls === "block") contradictionBlockRows.push(row);
    else contradictionWarnRows.push(row);
  }
  contradictionBlockRows.sort(sortBlockerRows);
  contradictionWarnRows.sort(sortBlockerRows);

  if (contradictionBlockRows.length > 0) {
    out.push({
      kind: "contradiction",
      gating: "block",
      title:
        contradictionBlockRows.length === 1
          ? "1 row contradicts an approved canonical answer"
          : `${contradictionBlockRows.length} rows contradict approved canonical answers`,
      description:
        "Export is blocked until each contradiction is resolved or dismissed (high or critical always; medium when workspace policy requires).",
      count: contradictionBlockRows.length,
      rows: contradictionBlockRows,
    });
  }
  if (contradictionWarnRows.length > 0) {
    out.push({
      kind: "contradiction",
      gating: "warn",
      title:
        contradictionWarnRows.length === 1
          ? "1 row has an open contradiction"
          : `${contradictionWarnRows.length} rows have open contradictions`,
      description:
        "These do not block export under current policy, but should be reviewed before treating the export as fully safe.",
      count: contradictionWarnRows.length,
      rows: contradictionWarnRows,
    });
  }

  // --- Reviewed rows still backed by non-export-safe library answers (strict buyer mode)
  if (args.strictBuyerMode && args.reviewedRowsBackedByNonExportLibrary > 0) {
    const rows: ExportBlockerRow[] = [];
    for (const item of args.allQuestionRows) {
      if (!item.reviewed || !item.suggestedAnswerId) continue;
      const mirrorsLibrary =
        reviewedRowUsesSuggestedLibraryText({
          finalAnswer: item.finalAnswer ?? "",
          suggestedAnswer: item.suggestedAnswer ?? "",
        });
      if (!mirrorsLibrary) continue;
      if (args.eligibility.get(item.suggestedAnswerId) === true) continue;
      rows.push(
        toBlockerRow({
          questionnaireId: args.questionnaireId,
          item,
          severity: "medium",
          resolutionStatus: null,
          message:
            "Reviewed text mirrors a library answer that is not export-safe. In strict buyer export this cell will be left blank.",
          contradictionType: null,
        }),
      );
    }
    rows.sort(sortBlockerRows);
    if (rows.length > 0) {
      out.push({
        kind: "non_export_safe_library_answer",
        gating: "warn",
        title:
          rows.length === 1
            ? "1 reviewed row relies on a non-export-safe library answer"
            : `${rows.length} reviewed rows rely on non-export-safe library answers`,
        description:
          args.buyerExportNotice ??
          "Review the library answer governance or replace the row text before exporting with strict buyer mode.",
        count: rows.length,
        rows,
      });
    }
  }

  // --- Unreviewed rows whose suggested library answer is not export-eligible
  if (args.exportScopeBlockedSuggestions > 0) {
    const rows: ExportBlockerRow[] = [];
    for (const item of args.allQuestionRows) {
      if (item.reviewed) continue;
      if (!item.suggestedAnswerId) continue;
      if (args.eligibility.get(item.suggestedAnswerId) === true) continue;
      rows.push(
        toBlockerRow({
          questionnaireId: args.questionnaireId,
          item,
          severity: "low",
          resolutionStatus: null,
          message:
            "Unresolved row suggests a library answer that is not approved for export. With 'include unresolved' export, this cell will be left blank.",
          contradictionType: null,
        }),
      );
    }
    rows.sort(sortBlockerRows);
    if (rows.length > 0) {
      out.push({
        kind: "export_scope_blocked_suggestion",
        gating: "warn",
        title:
          rows.length === 1
            ? "1 unresolved row uses a non-export-safe suggestion"
            : `${rows.length} unresolved rows use non-export-safe suggestions`,
        description:
          "Approve the library answer for export, pick a different answer, or resolve the row before export.",
        count: rows.length,
        rows,
      });
    }
  }

  // --- Unresolved rows reusing stale/expired library answers
  if (args.staleSuggestedAnswerCount > 0) {
    const rows: ExportBlockerRow[] = [];
    for (const item of args.allQuestionRows) {
      if (item.reviewed) continue;
      if (!item.suggestedAnswerId) continue;
      const ans = args.staleById.get(item.suggestedAnswerId);
      if (!ans) continue;
      if (freshnessBucket(args.now, ans) !== "expired_or_past_due") continue;
      rows.push(
        toBlockerRow({
          questionnaireId: args.questionnaireId,
          item,
          severity: "low",
          resolutionStatus: null,
          message:
            "Library answer is past its next review date. Confirm it is still current before exporting.",
          contradictionType: null,
        }),
      );
    }
    rows.sort(sortBlockerRows);
    if (rows.length > 0) {
      out.push({
        kind: "stale_suggested_answer",
        gating: "warn",
        title:
          rows.length === 1
            ? "1 unresolved row relies on a stale library answer"
            : `${rows.length} unresolved rows rely on stale library answers`,
        description:
          "Re-approve the library answer or update the row text before treating the export as fully current.",
        count: rows.length,
        rows,
      });
    }
  }

  // --- XLSX source unavailable (questionnaire-level)
  if (!args.xlsxAvailable && args.xlsxUnavailableReason) {
    out.push({
      kind: "xlsx_unavailable",
      gating: "block",
      title: "Excel export unavailable",
      description: args.xlsxUnavailableReason,
      count: 1,
      rows: [],
    });
  }

  // --- Macro-enabled source (warn only)
  if (args.macroSource && args.formatNotice) {
    out.push({
      kind: "macro_source",
      gating: "warn",
      title: "Macro-enabled source workbook",
      description: args.formatNotice,
      count: 1,
      rows: [],
    });
  }

  // --- Completeness: unanswered rows + uncommitted AI suggestions
  // A row is "unanswered" when it has no finalAnswer, no suggestedAnswer text, and no
  // linked library answer. A row is "uncommitted" when it has an AI-drafted
  // suggestedAnswer but the reviewer has not accepted/edited/manually overridden it.
  // Both surface under the completeness gate; only `unanswered_row` is eligible for the
  // block path because "the suggestion is still AI draft" is a weaker signal than "no
  // one has written anything yet".
  if (args.completenessGating !== "none" || args.unansweredPolicy !== "IGNORE") {
    const unansweredRows: ExportBlockerRow[] = [];
    const uncommittedRows: ExportBlockerRow[] = [];
    for (const item of args.allQuestionRows) {
      if (item.reviewed) continue;
      
      const state = getRowState(item as any);
      const isUnanswered = state === "blank_unanswered";
      const isUncommitted = state === "uncommitted_draft";

      if (isUnanswered) {
        unansweredRows.push(
          toBlockerRow({
            questionnaireId: args.questionnaireId,
            item,
            severity: args.completenessGating === "block" ? "high" : "medium",
            resolutionStatus: null,
            message:
              item.unresolvedReason
                ? `Row has no answer yet (${item.unresolvedReason}).`
                : "Row has no answer yet.",
            contradictionType: null,
            unresolvedReason: item.unresolvedReason ?? null,
          }),
        );
      } else if (isUncommitted) {
        uncommittedRows.push(
          toBlockerRow({
            questionnaireId: args.questionnaireId,
            item,
            severity: "low",
            resolutionStatus: null,
            message:
              "Row shows an AI-drafted suggestion that has not been accepted by a reviewer.",
            contradictionType: null,
            unresolvedReason: item.unresolvedReason ?? null,
          }),
        );
      }
    }
    unansweredRows.sort(sortBlockerRows);
    uncommittedRows.sort(sortBlockerRows);

    if (unansweredRows.length > 0 && args.completenessGating !== "none") {
      const gating = args.completenessGating;
      const hasThreshold = args.minReviewedPercent !== null;
      const thresholdReason =
        hasThreshold && args.reviewedCoveragePercent < (args.minReviewedPercent ?? 0)
          ? ` Reviewed coverage is ${Math.round(args.reviewedCoveragePercent)}% of the required ${args.minReviewedPercent}%.`
          : "";
      const description =
        gating === "block"
          ? `Export is blocked until every row has a reviewed answer.${thresholdReason}`
          : `These rows will be left as they were in the source spreadsheet. Review them before sharing externally.`;
      out.push({
        kind: "unanswered_row",
        gating,
        title:
          unansweredRows.length === 1
            ? "1 row has not been answered yet"
            : `${unansweredRows.length} rows have not been answered yet`,
        description,
        count: unansweredRows.length,
        rows: unansweredRows,
      });
    }

    if (uncommittedRows.length > 0 && args.unansweredPolicy !== "IGNORE") {
      out.push({
        kind: "uncommitted_suggestion",
        gating: "warn",
        title:
          uncommittedRows.length === 1
            ? "1 row has an unreviewed AI suggestion"
            : `${uncommittedRows.length} rows have unreviewed AI suggestions`,
        description:
          "These rows show AI-drafted answers that the reviewer has not accepted. Accept, edit, or replace them before treating the export as a final handoff.",
        count: uncommittedRows.length,
        rows: uncommittedRows,
      });
    }
  }

  // --- Evidence-level conflict (distinct from canonical contradiction)
  const evidenceConflictRows: ExportBlockerRow[] = [];
  for (const item of args.allQuestionRows) {
    if (item.reviewed) continue;
    const hasEvidenceConflict =
      item.reviewStatus === "conflict" ||
      (typeof item.conflictNote === "string" && item.conflictNote.trim().length > 0);
    if (!hasEvidenceConflict) continue;
    evidenceConflictRows.push(
      toBlockerRow({
        questionnaireId: args.questionnaireId,
        item,
        severity: "medium",
        resolutionStatus: null,
        message:
          item.conflictNote?.trim() ||
          "Evidence sources disagreed during onboarding; reconcile before export.",
        contradictionType: null,
      }),
    );
  }
  evidenceConflictRows.sort(sortBlockerRows);
  if (evidenceConflictRows.length > 0) {
    out.push({
      kind: "evidence_conflict",
      gating: "warn",
      title:
        evidenceConflictRows.length === 1
          ? "1 row has an unresolved evidence conflict"
          : `${evidenceConflictRows.length} rows have unresolved evidence conflicts`,
      description:
        "Evidence sources disagreed during onboarding. This is separate from canonical contradictions; reconcile the row in review before export.",
      count: evidenceConflictRows.length,
      rows: evidenceConflictRows,
    });
  }

  // --- Verified Empty Disclosure
  const verifiedEmptyRows: ExportBlockerRow[] = [];
  for (const item of args.allQuestionRows) {
    if (getRowState(item as any) === "verified_empty") {
      verifiedEmptyRows.push(
        toBlockerRow({
          questionnaireId: args.questionnaireId,
          item,
          severity: "info",
          resolutionStatus: null,
          message: "Row verified as empty; it will be blank in the export.",
          contradictionType: null,
        }),
      );
    }
  }
  if (verifiedEmptyRows.length > 0) {
    out.push({
      kind: "verified_empty",
      gating: "warn",
      title:
        verifiedEmptyRows.length === 1
          ? "1 row verified as empty"
          : `${verifiedEmptyRows.length} rows verified as empty`,
      description:
        "These rows were explicitly marked as empty by a reviewer. They will be blank in the export.",
      count: verifiedEmptyRows.length,
      rows: verifiedEmptyRows,
    });
  }

  // --- Missing Selection Source
  const missingSelectionRows: ExportBlockerRow[] = [];
  for (const item of args.allQuestionRows) {
    if (item.reviewed && (item.finalAnswer ?? "").trim().length > 0 && !item.finalAnswerSelection) {
      missingSelectionRows.push(
        toBlockerRow({
          questionnaireId: args.questionnaireId,
          item,
          severity: "low",
          resolutionStatus: null,
          message: "Final answer exists but selection source is missing. Integrity check recommended.",
          contradictionType: null,
        }),
      );
    }
  }
  if (missingSelectionRows.length > 0) {
    out.push({
      kind: "missing_selection_source",
      gating: "warn",
      title:
        missingSelectionRows.length === 1
          ? "1 row missing selection source"
          : `${missingSelectionRows.length} rows missing selection source`,
      description:
        "These rows have an answer but no recorded selection source. This may be a legacy record or indicate a state inconsistency.",
      count: missingSelectionRows.length,
      rows: missingSelectionRows,
    });
  }

  return out;
}

/**
 * Service to handle questionnaire result exports (XLSX, CSV).
 *
 * D12-US-01: XLSX re-injects answers into the original workbook uploaded
 * during import, preserving the original formatting the customer expects to
 * receive back. SheetJS is used for the load/write cycle because it handles
 * all OOXML namespace variants (including x:-prefixed files that ExcelJS
 * cannot parse).
 */
export const QuestionnaireExportService = {
  /**
   * Reports whether a questionnaire has everything it needs to be exported.
   * Used by the export UI to gate the XLSX tile and explain why it's
   * disabled for legacy records.
   */
  async getReadiness(questionnaireId: string, workspaceId: string): Promise<ExportReadiness> {
    const [questionnaire, workspaceSettings] = await Promise.all([
      prisma.questionnaire.findFirst({
        where: { id: questionnaireId, workspaceId },
        include: {
          jobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          items: {
            where: { workspaceId },
            orderBy: { rowNumber: "asc" },
            select: {
              id: true,
              type: true,
              rowNumber: true,
              question: true,
              topicName: true,
              reviewed: true,
              suggestedAnswerId: true,
              verificationStatus: true,
              finalAnswer: true,
              suggestedAnswer: true,
              unresolvedReason: true,
              finalAnswerSelection: true,
              reviewStatus: true,
              conflictNote: true,
              contradictionResult: {
                select: {
                  contradictionFound: true,
                  severity: true,
                  resolutionStatus: true,
                  message: true,
                  contradictionType: true,
                },
              },
            },
          },
        },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          questionnaireExportStrictBuyerMode: true,
          questionnaireExportContradictionMediumPolicy: true,
          questionnaireExportUnansweredPolicy: true,
          questionnaireExportMinReviewedPercent: true,
        },
      }),
    ]);

    if (!questionnaire) {
      throw QuestionnaireExportError.questionnaireNotFound();
    }

    const strictBuyerMode = workspaceSettings?.questionnaireExportStrictBuyerMode ?? true;
    const mediumContradictionPolicy = mediumExportPolicyFromDb(
      workspaceSettings?.questionnaireExportContradictionMediumPolicy,
    );
    const unansweredPolicy = unansweredExportPolicyFromDb(
      workspaceSettings?.questionnaireExportUnansweredPolicy,
    );
    const minReviewedPercent = normalizeMinReviewedPercent(
      workspaceSettings?.questionnaireExportMinReviewedPercent ?? null,
    );

    const questionRows = questionnaire.items.filter((item) => item.type === "question_row");

    const states = questionRows.map((q) => ({
      id: q.id,
      state: getRowState(q as any),
      item: q,
    }));

    const reviewed = questionRows.filter((item) => item.reviewed).length;
    const readyQuestions = states.filter((s) => s.state === "answered" || s.state === "verified_empty").length;
    const verifiedEmptyQuestions = states.filter((s) => s.state === "verified_empty").length;
    const unansweredQuestions = states.filter((s) => s.state === "blank_unanswered").length;
    const suggestedButUnconfirmedQuestions = states.filter((s) => s.state === "uncommitted_draft").length;

    // Provenance rule: Answered-ready must have a selection source.
    const answeredReadyQuestions = states.filter(
      (s) => s.state === "answered" && Boolean(s.item.finalAnswerSelection),
    ).length;

    // Integrity check: finalAnswer without selection source (legacy or bug).
    const missingSelectionCount = questionRows.filter(
      (q) => q.reviewed && (q.finalAnswer ?? "").trim().length > 0 && !q.finalAnswerSelection,
    ).length;

    const acceptedCount = questionRows.filter(
      (q) =>
        q.verificationStatus === "ACCEPTED" ||
        q.verificationStatus === "MANUAL_OVERRIDE" ||
        q.verificationStatus === "EDITED",
    ).length;
    const rejectedCount = questionRows.filter((q) => q.verificationStatus === "REJECTED").length;

    const counts = {
      total: questionRows.length,
      reviewed,
      accepted: acceptedCount,
      rejected: rejectedCount,
      unresolved: questionRows.length - reviewed,
    };

    const allLinkedIds = [
      ...new Set(
        questionRows
          .map((q) => q.suggestedAnswerId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const answerRowsForExport =
      allLinkedIds.length === 0
        ? []
        : await prisma.answerLibraryItem.findMany({
          where: { workspaceId, id: { in: allLinkedIds } },
          select: {
            id: true,
            status: true,
            governanceStatus: true,
            approvalScope: true,
            exportSafe: true,
            nextReviewDueAt: true,
          },
        });
    const eligibility = new Map<string, boolean>();
    for (const r of answerRowsForExport) {
      eligibility.set(r.id, isEligibleForExportReuse(r));
    }
    const exportScopeBlockedSuggestions = questionRows.filter(
      (q) => !q.reviewed && q.suggestedAnswerId && !eligibility.get(q.suggestedAnswerId as string),
    ).length;
    const exportScopeNotice =
      exportScopeBlockedSuggestions > 0
        ? `${exportScopeBlockedSuggestions} unresolved row(s) use library answers not approved for export. With “include unresolved” export, those cells are left blank.`
        : null;

    let reviewedRowsBackedByExportSafeLibrary = 0;
    let reviewedRowsBackedByNonExportLibrary = 0;
    let reviewedRowsCustomOrNoLibraryLink = 0;
    for (const q of questionRows) {
      if (!q.reviewed) continue;
      if (!q.suggestedAnswerId) {
        reviewedRowsCustomOrNoLibraryLink += 1;
        continue;
      }
      if (
        reviewedRowUsesSuggestedLibraryText({
          finalAnswer: q.finalAnswer,
          suggestedAnswer: q.suggestedAnswer,
        })
      ) {
        if (eligibility.get(q.suggestedAnswerId)) reviewedRowsBackedByExportSafeLibrary += 1;
        else reviewedRowsBackedByNonExportLibrary += 1;
      } else {
        reviewedRowsCustomOrNoLibraryLink += 1;
      }
    }
    const buyerExportNotice =
      strictBuyerMode && reviewedRowsBackedByNonExportLibrary > 0
        ? `${reviewedRowsBackedByNonExportLibrary} reviewed row(s) still mirror library text from answers that are not export-safe. In strict buyer export those cells will be left blank until the library answer is marked export-safe or the row text is replaced.`
        : null;

    const staleById = new Map(answerRowsForExport.map((r) => [r.id, r]));
    const now = new Date();
    const staleSuggestedAnswerCount = questionRows.filter((q) => {
      if (q.reviewed || !q.suggestedAnswerId) return false;
      const row = staleById.get(q.suggestedAnswerId as string);
      if (!row) return false;
      return freshnessBucket(now, row) === "expired_or_past_due";
    }).length;
    const staleSuggestedAnswerNotice =
      staleSuggestedAnswerCount > 0
        ? `${staleSuggestedAnswerCount} unresolved row(s) reuse library answers that are expired or past their next review date. Review them before treating export content as fully current.`
        : null;

    const job = questionnaire.jobs[0];
    const originalFileName = job?.originalName ?? questionnaire.sourceFileName ?? null;

    let xlsxAvailable = true;
    let reason: string | null = null;

    if (!job) {
      xlsxAvailable = false;
      reason = "No import job is linked to this questionnaire.";
    } else if (!job.fileBytes) {
      xlsxAvailable = false;
      reason =
        "The original spreadsheet is no longer attached. Re-import the source file to enable Excel export.";
    } else if (!job.selectedSheetName) {
      xlsxAvailable = false;
      reason = "The source sheet for this questionnaire was not recorded.";
    } else if (job.headerRowIndex === null || job.answerColIndex === null) {
      xlsxAvailable = false;
      reason = "The header row or answer column mapping for this questionnaire is missing.";
    }

    const macroSource = job ? isMacroEnabledSource(job) : false;
    const formatNotice = macroSource ? XLSM_FORMAT_NOTICE : null;

    // D12-US-02: give the UI the list of sheets so it can show the user
    // exactly what will be preserved. Use the cached previewJson when
    // available (scan time captured it); fall back to loading the workbook
    // only when the preview lacks sheet names but bytes are still around.
    let sheetNames: string[] = [];
    const previewSheetNames = extractSheetNamesFromPreview(job?.previewJson);
    if (previewSheetNames.length > 0) {
      sheetNames = previewSheetNames;
    } else if (job?.fileBytes) {
      try {
        // bookSheets:true tells SheetJS to parse only workbook.xml — fast.
        const probe = XLSX.read(Buffer.from(job.fileBytes as Uint8Array), {
          type: "buffer",
          bookSheets: true,
        });
        sheetNames = probe.SheetNames;
      } catch {
        sheetNames = [];
      }
    }

    // Only rows with a committed final answer can meaningfully contradict 
    // canonical truth in this phase. Suggestions are ignored until selected.
    const contradictionEligibleRows = questionRows.filter((q) => {
      const state = getRowState(q as any);
      return state === "answered";
    });
    const droppedStaleContradictionRowCount = questionRows.reduce((acc, q) => {
      if (!q.contradictionResult?.contradictionFound) return acc;
      const state = getRowState(q as any);
      const isEligible = state === "answered";
      return isEligible ? acc : acc + 1;
    }, 0);
    if (droppedStaleContradictionRowCount > 0) {
      logger.info("questionnaire.export:contradiction_stale_rows_ignored", {
        workspaceId,
        questionnaireId,
        droppedStaleContradictionRowCount,
      });
    }

    const contradictionAgg = aggregateContradictionExportGate(
      contradictionEligibleRows.map((q) => q.contradictionResult),
      mediumContradictionPolicy,
    );
    const { notice: contradictionExportNotice, warnNotice: contradictionExportWarnNotice } =
      buildContradictionExportNotices(
        contradictionAgg.blockingRowCount,
        contradictionAgg.warningRowCount,
      );
    const contradictionExportBlocked = contradictionAgg.blocksExport;
    let csvAvailable = counts.total > 0;
    if (contradictionExportBlocked) {
      xlsxAvailable = false;
      csvAvailable = false;
    }

    const completenessGating = resolveCompletenessGating({
      policy: unansweredPolicy,
      minReviewedPercent,
      total: counts.total,
      reviewed: counts.reviewed,
    });
    const reviewedCoveragePercent =
      counts.total > 0 ? (counts.reviewed / counts.total) * 100 : 100;
    const completenessExportBlocked = completenessGating === "block";

    const blockers = buildExportBlockerCategories({
      questionnaireId,
      items: contradictionEligibleRows,
      allQuestionRows: questionRows,
      mediumPolicy: mediumContradictionPolicy,
      strictBuyerMode,
      eligibility,
      staleById,
      now,
      xlsxAvailable,
      xlsxUnavailableReason: reason,
      macroSource,
      formatNotice,
      contradictionBlockingRowCount: contradictionAgg.blockingRowCount,
      contradictionWarningRowCount: contradictionAgg.warningRowCount,
      exportScopeBlockedSuggestions,
      staleSuggestedAnswerCount,
      reviewedRowsBackedByNonExportLibrary,
      buyerExportNotice,
      completenessGating,
      unansweredPolicy,
      minReviewedPercent,
      reviewedCoveragePercent,
    });

    // Completeness can also hard-block download — mirror the existing contradiction
    // gate so CSV falls back to unavailable when the policy would refuse export.
    if (completenessExportBlocked) {
      xlsxAvailable = false;
      csvAvailable = false;
    }

    // Derive per-category counts for the response.
    const unansweredCategory = blockers.find((b) => b.kind === "unanswered_row");
    const uncommittedCategory = blockers.find((b) => b.kind === "uncommitted_suggestion");
    const evidenceCategory = blockers.find((b) => b.kind === "evidence_conflict");

    const blockerCount = blockers.filter((b) => b.gating === "block").reduce((acc, b) => acc + b.count, 0);
    const warningCount = blockers.filter((b) => b.gating === "warn").reduce((acc, b) => acc + b.count, 0);

    let verdict: ExportReadinessVerdict = "ready";
    let summaryTitle = "Ready to export";
    let summaryMessage = "All pre-export checks passed for this questionnaire.";

    // Precedence: blocked > incomplete > needs_review > ready_with_warnings > ready
    const hasCriticalBlocker = blockers.some(
      (b) =>
        b.gating === "block" &&
        b.kind !== "unanswered_row" &&
        b.kind !== "uncommitted_suggestion" &&
        (b.kind !== "xlsx_unavailable" || (!completenessExportBlocked && !contradictionExportBlocked)),
    );

    if (hasCriticalBlocker) {
      verdict = "blocked";
      summaryTitle = "Export blocked";
      summaryMessage = `${blockerCount} critical ${blockerCount === 1 ? "issue" : "issues"} must be resolved before export.`;
    } else if (unansweredQuestions > 0) {
      verdict = "incomplete";
      summaryTitle = "Review in progress";
      summaryMessage = `${unansweredQuestions} row(s) have not been answered yet.`;
    } else if (suggestedButUnconfirmedQuestions > 0) {
      verdict = "needs_review";
      summaryTitle = "Review recommended";
      summaryMessage = `${suggestedButUnconfirmedQuestions} AI-drafted suggestion(s) must be reviewed.`;
    } else if (warningCount > 0) {
      verdict = "ready_with_warnings";
      summaryTitle = "Review recommended";
      summaryMessage = `${warningCount} non-blocking ${warningCount === 1 ? "issue" : "issues"} should be reviewed before handoff.`;
    }

    const canExport = verdict === "ready" || verdict === "ready_with_warnings";

    return {
      xlsxAvailable,
      csvAvailable,
      originalFileName,
      reason,
      macroSource,
      formatNotice,
      sheetNames,
      targetSheetName: job?.selectedSheetName ?? null,
      counts,
      totalQuestions: questionRows.length,
      readyQuestions,
      answeredReadyQuestions,
      unansweredQuestions,
      suggestedButUnconfirmedQuestions,
      verifiedEmptyQuestions,
      blockedQuestions: blockerCount,
      warningQuestions: warningCount,
      completenessPercentage: questionRows.length > 0 ? (readyQuestions / questionRows.length) * 100 : 100,
      canExport,
      readinessLabel: verdict,
      summary: {
        verdict,
        title: summaryTitle,
        message: summaryMessage,
        blockerCount,
        warningCount,
        canExport,
      },
      exportScopeBlockedSuggestions,
      exportScopeNotice,
      staleSuggestedAnswerCount,
      staleSuggestedAnswerNotice,
      questionnaireExportStrictBuyerMode: strictBuyerMode,
      reviewedRowsBackedByExportSafeLibrary,
      reviewedRowsBackedByNonExportLibrary,
      reviewedRowsCustomOrNoLibraryLink,
      buyerExportNotice,
      contradictionExportBlocked,
      contradictionBlockingRowCount: contradictionAgg.blockingRowCount,
      contradictionWarningRowCount: contradictionAgg.warningRowCount,
      contradictionExportNotice,
      contradictionExportWarnNotice,
      questionnaireExportContradictionMediumPolicy: mediumContradictionPolicy,
      questionnaireExportUnansweredPolicy: unansweredPolicy,
      questionnaireExportMinReviewedPercent: minReviewedPercent,
      completenessExportBlocked,
      unansweredRowCount: unansweredCategory?.count ?? 0,
      uncommittedSuggestionRowCount: uncommittedCategory?.count ?? 0,
      evidenceConflictRowCount: evidenceCategory?.count ?? 0,
      blockers,
    };
  },

  /**
   * Generates a high-fidelity XLSX export by injecting answers into the
   * original workbook that was uploaded during import.
   *
   * SheetJS handles all OOXML namespace variants (including x:-prefixed files
   * that ExcelJS cannot parse). All non-target sheets and structural features
   * (column widths, merges, frozen panes, tab color, hidden state) are
   * preserved because SheetJS reads and writes the full workbook (D12-EN-03,
   * D12-US-02).
   */
  async exportToXlsx(
    questionnaireId: string,
    workspaceId: string,
    options: ExportOptions = {},
  ): Promise<ExportResult> {
    const { includeUnresolved = false, strictBuyerExport: strictBuyerOverride } = options;

    const questionnaire = await prisma.questionnaire.findFirst({
      where: { id: questionnaireId, workspaceId },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        items: {
          where: { workspaceId },
          orderBy: { rowNumber: "asc" },
          include: {
            contradictionResult: {
              select: {
                contradictionFound: true,
                severity: true,
                resolutionStatus: true,
              },
            },
          },
        },
      },
    });

    if (!questionnaire) {
      throw QuestionnaireExportError.questionnaireNotFound();
    }

    const workspaceSettings = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        questionnaireExportStrictBuyerMode: true,
        questionnaireExportContradictionMediumPolicy: true,
        questionnaireExportUnansweredPolicy: true,
        questionnaireExportMinReviewedPercent: true,
        exportFontFamily: true,
        exportFontSize: true,
        exportBoldHeaders: true,
        exportVerticalTop: true,
        exportWrapText: true,
        exportOutputColumnName: true,
        exportAutoMoveNotesToEnd: true,
      },
    });

    assertContradictionExportAllowedForItems(
      questionnaire.items as ItemContradictionSlice[],
      mediumExportPolicyFromDb(workspaceSettings?.questionnaireExportContradictionMediumPolicy),
    );
    assertExportCompletenessAllowedForItems({
      items: questionnaire.items as Array<{ type: string; reviewed: boolean }>,
      policy: unansweredExportPolicyFromDb(workspaceSettings?.questionnaireExportUnansweredPolicy),
      minReviewedPercent: normalizeMinReviewedPercent(
        workspaceSettings?.questionnaireExportMinReviewedPercent ?? null,
      ),
    });

    const strictBuyer =
      strictBuyerOverride !== undefined
        ? strictBuyerOverride
        : (workspaceSettings?.questionnaireExportStrictBuyerMode ?? true);

    const job = questionnaire.jobs[0];
    if (!job?.fileBytes) {
      throw QuestionnaireExportError.sourceUnavailable();
    }
    if (!job.selectedSheetName) {
      throw QuestionnaireExportError.sheetMissing("(unspecified)");
    }
    if (job.headerRowIndex === null || job.answerColIndex === null) {
      throw QuestionnaireExportError.mappingMissing();
    }

    // Load workbook using ExcelJS after normalizing non-standard XML namespaces.
    // ExcelJS provides full style support (fonts, fills, borders) which resolve
    // the corruption issues seen with the SheetJS Community writer.
    const normalizedBuffer = await normalizeWorkbook(Buffer.from(job.fileBytes as Uint8Array));

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(normalizedBuffer);

    const ws = wb.getWorksheet(job.selectedSheetName);
    if (!ws) {
      throw QuestionnaireExportError.sheetMissing(job.selectedSheetName);
    }

    // D12-EN-03: Clear data validations at the worksheet model level.
    // Notes/comments are already stripped by normalizeWorkbook (which removes
    // xl/comments*.xml and vmlDrawing*.vml from the zip before ExcelJS loads).
    // Iterating cells with includeEmpty:true and setting cell.note/dataValidation
    // to undefined was creating 102 empty entries per cell — causing ExcelJS to
    // write phantom comments, VML shapes and data-validation blocks that Excel
    // flags as corruption ("we found a problem while opening the file").
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dvModel = (ws as any).dataValidations;
    if (dvModel && typeof dvModel.model === "object") {
      dvModel.model = {};
    }

    // DB indices are 0-based; ExcelJS indices are 1-based.
    const headerRowNumber = job.headerRowIndex + 1;
    let targetColNumber: number;

    // Save the original column count before suggestNewAnswer may append an extra column.
    // Used later to ensure we only swap within the source file's own columns.
    const originalColumnCount = ws.columnCount;

    if (questionnaire.suggestNewAnswer) {
      // Find the last used column and append one after it.
      targetColNumber = ws.columnCount + 1;

      const headerRow = ws.getRow(headerRowNumber);
      const neighborCell = headerRow.getCell(targetColNumber - 1);
      const targetCell = headerRow.getCell(targetColNumber);

      targetCell.value =
        questionnaire.outputColumnName ||
        workspaceSettings?.exportOutputColumnName ||
        "TrustDesk Suggested Answer";

      // D12-EN-03 AC4: Inherit neighbor style to maintain visual consistency.
      if (neighborCell.style) {
        targetCell.style = { ...neighborCell.style };
      }

      // Apply bold header if configured
      if (workspaceSettings?.exportBoldHeaders) {
        targetCell.font = { ...(targetCell.font || {}), bold: true };
      }
    } else {
      targetColNumber = job.answerColIndex + 1;
    }

    const questions = questionnaire.items.filter((item) => item.type === "question_row");

    const exportEligibility = await buildAnswerExportEligibilityMap(
      workspaceId,
      questions
        .map((q) => q.suggestedAnswerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    // Track every answer we actually wrote so we can size the column to the longest
    // content and then (as a second pass) recompute row heights against the FINAL
    // column width. Doing this post-write lets short and long answers share a
    // readable column instead of inheriting whatever narrow width the source had.
    const writtenAnswers: Array<{ rowNumber: number; val: string; fontSize: number }> = [];

    for (const item of questions) {
      if (!item.rowNumber) continue;

      const row = ws.getRow(item.rowNumber);
      const cell = row.getCell(targetColNumber);

      let val: string | null = null;
      if (item.reviewed && !item.isMock) {
        const raw = (item.finalAnswer ?? "").trim();
        if (
          strictBuyer &&
          item.suggestedAnswerId &&
          reviewedRowUsesSuggestedLibraryText({
            finalAnswer: item.finalAnswer,
            suggestedAnswer: item.suggestedAnswer,
          }) &&
          !exportEligibility.get(item.suggestedAnswerId as string)
        ) {
          val = "";
        } else {
          val = raw;
        }
      } else if (includeUnresolved && !item.isMock) {
        const gated = exportGatedFallbackText(item, includeUnresolved, exportEligibility);
        val = gated === null ? null : gated;
      }

      // TRACE BUG FIX: If val is explicitly empty but the row is reviewed (e.g. REJECTED),
      // we MUST write the empty string to clear the cell. Skipping (continue) like the
      // previous implementation did is what caused "old statuses" to persist.
      if (val === "" && item.reviewed) {
        cell.value = "";
      } else if (val === "" && !item.reviewed && includeUnresolved) {
        // Library-linked suggestion blocked from export (internal-only approval).
        cell.value = "";
      } else if (val) {
        cell.value = val;

        // Apply workspace-defined alignment and wrap
        cell.alignment = {
          ...(cell.alignment ?? {}),
          wrapText: workspaceSettings?.exportWrapText ?? true,
          vertical: workspaceSettings?.exportVerticalTop ? "top" : (cell.alignment?.vertical ?? "middle"),
        };

        // Apply workspace-defined font
        if (workspaceSettings?.exportFontFamily || workspaceSettings?.exportFontSize) {
          cell.font = {
            ...(cell.font ?? {}),
            name: workspaceSettings?.exportFontFamily || cell.font?.name,
            size: workspaceSettings?.exportFontSize || cell.font?.size,
          };
        }

        writtenAnswers.push({
          rowNumber: item.rowNumber,
          val,
          fontSize: workspaceSettings?.exportFontSize || 12,
        });
      }
      // If val is null (unresolved and includeUnresolved=false), we leave cellular content as-is.
    }

    // Second pass: size the answer column and row heights to fit the written content.
    // Dynamic cell sizing avoids the pre-fix behaviour where a source column width of
    // 12 forced a 600-char answer to wrap to 30+ lines and then get visually truncated
    // by the old 400pt row-height cap. Column alignment is set at the column level so
    // even rows we did not touch (e.g. unresolved-skipped) inherit wrapText + top.
    if (writtenAnswers.length > 0) {
      const MIN_ANSWER_COL_WIDTH = 40;
      const MAX_ANSWER_COL_WIDTH = 120;
      // ~8 characters per unit of Excel "width" at the default 11pt Calibri font.
      const CHARS_PER_WIDTH_UNIT = 8;

      const longestAnswerChars = writtenAnswers.reduce(
        (max, r) => Math.max(max, r.val.length),
        0,
      );
      const existingWidth = ws.getColumn(targetColNumber).width ?? 0;
      const derivedWidth = Math.ceil(longestAnswerChars / CHARS_PER_WIDTH_UNIT);
      const targetWidth = Math.min(
        MAX_ANSWER_COL_WIDTH,
        Math.max(MIN_ANSWER_COL_WIDTH, existingWidth, derivedWidth),
      );
      ws.getColumn(targetColNumber).width = targetWidth;
      ws.getColumn(targetColNumber).alignment = {
        ...(ws.getColumn(targetColNumber).alignment ?? {}),
        wrapText: workspaceSettings?.exportWrapText ?? true,
        vertical: workspaceSettings?.exportVerticalTop ? "top" : "top",
      };

      const finalColWidth = ws.getColumn(targetColNumber).width ?? targetWidth;
      // Approx characters that fit on one wrapped line at this column width.
      const charsPerLine = Math.max(10, Math.floor(finalColWidth));
      // Pad by ~10% because word-wrap breaks often leave trailing whitespace on a line.
      const WORD_BREAK_FACTOR = 1.1;

      for (const { rowNumber, val, fontSize } of writtenAnswers) {
        const estimatedLines = Math.ceil((val.length / charsPerLine) * WORD_BREAK_FACTOR);
        const explicitNewlines = (val.match(/\n/g) ?? []).length;
        const lines = Math.max(1, estimatedLines + explicitNewlines);
        // 1.35x line-height mirrors Excel's default line spacing for wrapped text.
        const lineHeightPt = Math.round(fontSize * 1.35);
        const neededHeight = lines * lineHeightPt + 4;
        const row = ws.getRow(rowNumber);
        // No upper clamp: Excel itself enforces a ~409pt max; we stop truncating
        // long answers client-side.
        row.height = Math.max(row.height ?? 15, neededHeight);
      }
    }

    // Move any notes-like column to the last position by swapping it with the
    // current last source column. Uses a value-swap instead of spliceColumns so
    // that ExcelJS table definitions (table1.xml) are not broken — spliceColumns
    // shifts cell data but never updates worksheet.tables, causing Excel to
    // insert a spurious "Column1" repair column.
    const NOTES_HEADER_RE = /\b(note|notes|comment|comments|remark|remarks)\b/i;
    const headerRowObj = ws.getRow(headerRowNumber);
    let notesColIdx: number | null = null;
    headerRowObj.eachCell((cell, colNumber) => {
      if (notesColIdx === null && NOTES_HEADER_RE.test(String(cell.value ?? ""))) {
        notesColIdx = colNumber;
      }
    });

    // Only swap within the original source columns (ignore any suggestNewAnswer
    // column appended beyond originalColumnCount).
    if (
      workspaceSettings?.exportAutoMoveNotesToEnd &&
      notesColIdx !== null &&
      notesColIdx < originalColumnCount
    ) {
      const swapTargetCol = originalColumnCount;

      // Swap header cell values between the notes column and the last source column.
      const notesHeaderCell = ws.getRow(headerRowNumber).getCell(notesColIdx);
      const lastHeaderCell = ws.getRow(headerRowNumber).getCell(swapTargetCol);
      const tmpHeaderVal = notesHeaderCell.value;
      notesHeaderCell.value = lastHeaderCell.value;
      lastHeaderCell.value = tmpHeaderVal;

      // Swap column widths.
      const notesWidth = ws.getColumn(notesColIdx).width;
      const lastWidth = ws.getColumn(swapTargetCol).width;
      if (notesWidth !== undefined) ws.getColumn(swapTargetCol).width = notesWidth;
      if (lastWidth !== undefined) ws.getColumn(notesColIdx).width = lastWidth;

      // Swap all data row values between the two columns.
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === headerRowNumber) return;
        const notesCell = row.getCell(notesColIdx!);
        const lastCell = row.getCell(swapTargetCol);
        const tmpVal = notesCell.value;
        notesCell.value = lastCell.value;
        lastCell.value = tmpVal;
      });

      // Sync the ExcelJS table model column order to match the new header positions.
      // Without this, table1.xml would still list columns in their original order,
      // causing a name/position mismatch that Excel flags as corruption.
      for (const tableObj of ws.getTables()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cols = (tableObj as any).table?.columns as Array<{ name: string }> | undefined;
        if (!Array.isArray(cols) || cols.length < 2) continue;
        const notesModelIdx = cols.findIndex((c) => NOTES_HEADER_RE.test(String(c.name ?? "")));
        if (notesModelIdx !== -1 && notesModelIdx !== cols.length - 1) {
          const tmp = cols[notesModelIdx];
          cols[notesModelIdx] = cols[cols.length - 1];
          cols[cols.length - 1] = tmp;
        }
      }
    }

    const buffer = (await wb.xlsx.writeBuffer()) as Buffer;

    const baseName = job.originalName
      ? stripExtension(job.originalName)
      : questionnaire.sourceFileName
        ? stripExtension(questionnaire.sourceFileName)
        : slugify(questionnaire.title);
    const fileName = `${baseName} - TrustDesk.xlsx`;

    // MT-EN-04: Persist to S3
    const cfg = requireStorageConfig();
    const exportId = Math.random().toString(36).substring(7); // Simple deterministic ID for path
    const storageKey = `workspaces/${workspaceId}/exports/${questionnaireId}/${exportId}/${fileName}`;

    await uploadObject({
      workspaceId,
      key: storageKey,
      body: new Uint8Array(buffer),
      contentType: XLSX_MIME,
      contentLength: buffer.length,
    });

    const exportJob = await prisma.exportJob.create({
      data: {
        workspaceId,
        format: "xlsx",
        fileName,
        storageKey,
        storageBucket: cfg.bucket,
        status: "completed",
      },
    });

    return { buffer, fileName, contentType: XLSX_MIME, jobId: exportJob.id, storageKey };
  },


  /**
   * Generates a lean CSV export of questions and answers.
   */
  async exportToCsv(
    questionnaireId: string,
    workspaceId: string,
    options: ExportOptions = {},
  ): Promise<ExportResult> {
    const { includeUnresolved = false, strictBuyerExport: strictBuyerOverride } = options;

    const [questionnaire, workspaceForStrict] = await Promise.all([
      prisma.questionnaire.findFirst({
        where: { id: questionnaireId, workspaceId },
        include: {
          items: {
            orderBy: { rowNumber: "asc" },
            include: {
              contradictionResult: {
                select: {
                  contradictionFound: true,
                  severity: true,
                  resolutionStatus: true,
                },
              },
            },
          },
        },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
          questionnaireExportStrictBuyerMode: true,
          questionnaireExportContradictionMediumPolicy: true,
          questionnaireExportUnansweredPolicy: true,
          questionnaireExportMinReviewedPercent: true,
        },
      }),
    ]);

    if (!questionnaire) {
      throw QuestionnaireExportError.questionnaireNotFound();
    }

    assertContradictionExportAllowedForItems(
      questionnaire.items as ItemContradictionSlice[],
      mediumExportPolicyFromDb(workspaceForStrict?.questionnaireExportContradictionMediumPolicy),
    );
    assertExportCompletenessAllowedForItems({
      items: questionnaire.items as Array<{ type: string; reviewed: boolean }>,
      policy: unansweredExportPolicyFromDb(workspaceForStrict?.questionnaireExportUnansweredPolicy),
      minReviewedPercent: normalizeMinReviewedPercent(
        workspaceForStrict?.questionnaireExportMinReviewedPercent ?? null,
      ),
    });

    const strictBuyer =
      strictBuyerOverride !== undefined
        ? strictBuyerOverride
        : (workspaceForStrict?.questionnaireExportStrictBuyerMode ?? true);

    let csvContent = "Row,Question,Answer\n";

    const questions = questionnaire.items.filter((item) => item.type === "question_row");

    const exportEligibility = await buildAnswerExportEligibilityMap(
      workspaceId,
      questions
        .map((q) => q.suggestedAnswerId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );

    for (const item of questions) {
      const rowNum = item.rowNumber || 0;
      const questionText = this.escapeCsv(item.question);

      let answerText = "";
      if (item.reviewed && !item.isMock) {
        const raw = (item.finalAnswer ?? "").trim();
        if (
          strictBuyer &&
          item.suggestedAnswerId &&
          reviewedRowUsesSuggestedLibraryText({
            finalAnswer: item.finalAnswer,
            suggestedAnswer: item.suggestedAnswer,
          }) &&
          !exportEligibility.get(item.suggestedAnswerId as string)
        ) {
          answerText = "";
        } else {
          answerText = this.escapeCsv(raw);
        }
      } else if (includeUnresolved && !item.isMock) {
        const gated = exportGatedFallbackText(item, includeUnresolved, exportEligibility);
        answerText = gated ? this.escapeCsv(gated) : "";
      }

      csvContent += `${rowNum},"${questionText}","${answerText}"\n`;
    }

    const buffer = Buffer.from(csvContent, "utf-8");

    const baseName = questionnaire.sourceFileName
      ? stripExtension(questionnaire.sourceFileName)
      : slugify(questionnaire.title);
    const fileName = `${baseName} - TrustDesk.csv`;

    // MT-EN-04: Persist to S3
    const cfg = requireStorageConfig();
    const exportId = Math.random().toString(36).substring(7);
    const storageKey = `workspaces/${workspaceId}/exports/${questionnaireId}/${exportId}/${fileName}`;

    await uploadObject({
      workspaceId,
      key: storageKey,
      body: new Uint8Array(buffer),
      contentType: CSV_MIME,
      contentLength: buffer.length,
    });

    const exportJob = await prisma.exportJob.create({
      data: {
        workspaceId,
        format: "csv",
        fileName,
        storageKey,
        storageBucket: cfg.bucket,
        status: "completed",
      },
    });

    return { buffer, fileName, contentType: CSV_MIME, jobId: exportJob.id, storageKey };
  },


  /**
   * Helper to escape CSV fields.
   */
  escapeCsv(val: string): string {
    return val.replace(/"/g, '""').replace(/\r?\n/g, " ");
  },
};
