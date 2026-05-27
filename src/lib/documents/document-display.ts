import type { StatusVariant } from "@/components/ui/status-badge";

export interface SourceDocumentRow {
  id: string;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadStatus: string;
  version: number;
  isLatest: boolean;
  versionLabel?: string | null;
  createdAt: string;
  _count?: {
    chunks: number;
  };
  parseJobs: Array<{
    id?: string;
    status: string;
    errorMessage: string | null;
    failureCode?: string | null;
    retryCount?: number;
    lastHeartbeatAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>;
  answerSeedingJobs: Array<{
    id?: string;
    status: string;
    lastError: string | null;
    failureCode?: string | null;
    lastHeartbeatAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>;
  uploadedBy: {
    name: string | null;
    email: string;
  };
}

export type LifecycleStage = "Upload" | "Parse" | "Seeding" | "Ready";

/** Stage-specific status for granular lifecycle tracking */
export type StageStatus =
  | "PENDING"           // Not started yet
  | "QUEUED"            // Waiting to be processed
  | "PROCESSING"      // Actively being processed
  | "RUNNING"           // Alias for processing (seeding)
  | "COMPLETED"         // Successfully finished
  | "PARTIAL"           // Completed with some failures
  | "FAILED"            // Failed with error
  | "WAITING";          // Waiting for dependency

/** Parse job status from DB */
export type ParseJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

/** Seeding job status from DB */
export type SeedingJobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED";

export interface DocumentLifecycle {
  upload: { label: string; variant: StatusVariant; status: string };
  parse: { label: string; variant: StatusVariant; status: string | null; error?: string | null; isStale?: boolean };
  seeding: { label: string; variant: StatusVariant; status: string | null; error?: string | null; isStale?: boolean };
  currentStage: LifecycleStage;
  activeLabel: string;
  activeVariant: StatusVariant;
  activeError?: string | null;
  isTerminal: boolean;
}

/**
 * Derives the document lifecycle state with stage-aware status mapping.
 *
 * Rules:
 * - Upload stage: driven only by SourceDocument.uploadStatus
 * - Parse stage: driven only by the latest parse job (or null if none exists)
 * - Seeding stage: driven only by the latest seeding job (or null if none exists)
 * - No stage shows failure unless a real FAILED job exists
 * - Transitional states (QUEUED, PROCESSING, RUNNING) are not terminal
 */
export function getDocumentLifecycle(d: SourceDocumentRow): DocumentLifecycle {
  // Guard against missing document data
  if (!d) {
    return {
      upload: { label: "Pending", variant: "neutral", status: "PENDING" },
      parse: { label: "Waiting", variant: "neutral", status: null },
      seeding: { label: "Waiting", variant: "neutral", status: null },
      currentStage: "Upload",
      activeLabel: "Loading...",
      activeVariant: "neutral",
      isTerminal: false,
    };
  }

  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes heartbeat gap
  const TOO_LONG_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes total execution warning
  const isNow = Date.now();

  // ============ UPLOAD STAGE ============
  const uploadStatus = d.uploadStatus || "PENDING";
  const upload = deriveUploadStage(uploadStatus);

  // ============ PARSE STAGE ============
  const parseJob = Array.isArray(d.parseJobs) ? d.parseJobs[0] : null;
  const parse = deriveParseStage(parseJob, isNow, STALE_THRESHOLD_MS, TOO_LONG_THRESHOLD_MS);

  // ============ SEEDING STAGE ============
  const seedJob = Array.isArray(d.answerSeedingJobs) ? d.answerSeedingJobs[0] : null;
  const seeding = deriveSeedingStage(seedJob, isNow, STALE_THRESHOLD_MS);

  // ============ CURRENT STAGE & ACTIVE STATE ============
  const { currentStage, activeLabel, activeVariant, activeError } = deriveCurrentStage(
    uploadStatus,
    upload,
    parse,
    seeding
  );

  // ============ TERMINAL STATE ============
  // Terminal = explicitly failed OR seeding completed/partial
  // Upload pending/processing and parse/seeding queued/processing are NOT terminal
  const isTerminal =
    uploadStatus === "FAILED" ||
    parse.status === "FAILED" ||
    seeding.status === "FAILED" ||
    seeding.status === "COMPLETED" ||
    seeding.status === "PARTIAL";

  return {
    upload,
    parse,
    seeding,
    currentStage,
    activeLabel,
    activeVariant,
    activeError,
    isTerminal,
  };
}

/** Derive upload stage status from uploadStatus */
function deriveUploadStage(uploadStatus: string) {
  if (uploadStatus === "UPLOADED") {
    return {
      status: "UPLOADED" as const,
      label: "Uploaded",
      variant: "ok" as StatusVariant,
    };
  }
  if (uploadStatus === "FAILED") {
    return {
      status: "FAILED" as const,
      label: "Failed",
      variant: "error" as StatusVariant,
    };
  }
  // PENDING or any other state = still uploading
  return {
    status: uploadStatus,
    label: "Pending",
    variant: "neutral" as StatusVariant,
  };
}

/** Derive parse stage status from parse job data */
function deriveParseStage(
  parseJob: SourceDocumentRow["parseJobs"][0] | null,
  isNow: number,
  staleThresholdMs: number,
  tooLongThresholdMs: number
) {
  // No parse job exists yet = waiting for parsing to start
  if (!parseJob) {
    return {
      status: null as ParseJobStatus | null,
      label: "Waiting",
      variant: "neutral" as StatusVariant,
      error: null as string | null,
      isStale: false,
    };
  }

  const parseStatus = parseJob.status as ParseJobStatus;

  // Check for stale job
  const parseHeartbeat = parseJob.lastHeartbeatAt ? new Date(parseJob.lastHeartbeatAt).getTime() : 0;
  const parseStartedAt = parseJob.createdAt ? new Date(parseJob.createdAt).getTime() : 0;
  const isStale =
    parseStatus === "PROCESSING" &&
    ((isNow - parseHeartbeat > staleThresholdMs) || (isNow - parseStartedAt > tooLongThresholdMs));

  // Determine label and variant based on status
  let label: string;
  let variant: StatusVariant;

  if (isStale) {
    label = "Delayed";
    variant = "warning";
  } else {
    switch (parseStatus) {
      case "QUEUED":
        label = "Queued";
        variant = "neutral";
        break;
      case "PROCESSING":
        label = "Processing";
        variant = "neutral";
        break;
      case "COMPLETED":
        label = "Parsed";
        variant = "ok";
        break;
      case "FAILED":
        label = "Failed";
        variant = "error";
        break;
      default:
        label = "Waiting";
        variant = "neutral";
    }
  }

  const error =
    parseJob.errorMessage ??
    (parseJob.failureCode === "STALE_ORPHAN" ? "Job timed out or was interrupted" : null);

  return {
    status: parseStatus,
    label,
    variant,
    error,
    isStale,
  };
}

/** Derive seeding stage status from seeding job data */
function deriveSeedingStage(
  seedJob: SourceDocumentRow["answerSeedingJobs"][0] | null,
  isNow: number,
  staleThresholdMs: number
) {
  // No seeding job exists yet = waiting for seeding to start
  if (!seedJob) {
    return {
      status: null as SeedingJobStatus | null,
      label: "Waiting",
      variant: "neutral" as StatusVariant,
      error: null as string | null,
      isStale: false,
    };
  }

  const seedStatus = seedJob.status as SeedingJobStatus;

  // Check for stale job
  const seedHeartbeat = seedJob.lastHeartbeatAt ? new Date(seedJob.lastHeartbeatAt).getTime() : 0;
  const isStale = seedStatus === "RUNNING" && isNow - seedHeartbeat > staleThresholdMs;

  // Determine label and variant based on status
  let label: string;
  let variant: StatusVariant;

  if (isStale) {
    label = "Delayed";
    variant = "warning";
  } else {
    switch (seedStatus) {
      case "QUEUED":
        label = "Queued";
        variant = "neutral";
        break;
      case "RUNNING":
        label = "Seeding";
        variant = "neutral";
        break;
      case "COMPLETED":
        label = "Complete";
        variant = "ok";
        break;
      case "PARTIAL":
        label = "Partial";
        variant = "warning";
        break;
      case "FAILED":
        label = "Failed";
        variant = "error";
        break;
      default:
        label = "Waiting";
        variant = "neutral";
    }
  }

  return {
    status: seedStatus,
    label,
    variant,
    error: seedJob.lastError ?? null,
    isStale,
  };
}

/** Derive current active stage and display state */
function deriveCurrentStage(
  uploadStatus: string,
  upload: { label: string; variant: StatusVariant },
  parse: { status: ParseJobStatus | null; label: string; variant: StatusVariant; error: string | null },
  seeding: { status: SeedingJobStatus | null; label: string; variant: StatusVariant; error: string | null }
): {
  currentStage: LifecycleStage;
  activeLabel: string;
  activeVariant: StatusVariant;
  activeError: string | null;
} {
  let currentStage: LifecycleStage = "Upload";
  let activeLabel = upload.label;
  let activeVariant = upload.variant;
  let activeError: string | null = null;

  // Upload not complete = stay in upload stage
  if (uploadStatus !== "UPLOADED") {
    if (uploadStatus === "PENDING") {
      activeLabel = "Uploading...";
    }
    return { currentStage, activeLabel, activeVariant, activeError };
  }

  // Upload complete, move to parse stage
  currentStage = "Parse";
  activeLabel = parse.label;
  activeVariant = parse.variant;
  activeError = parse.error;

  // Parse not complete = show parse-specific state
  if (parse.status !== "COMPLETED") {
    // Refine labels for active processing states
    if (parse.status === "QUEUED") {
      activeLabel = "Queued for parsing";
    } else if (parse.status === "PROCESSING") {
      activeLabel = "Extracting text...";
    } else if (!parse.status) {
      // No parse job yet
      activeLabel = "Waiting for parsing";
      activeVariant = "neutral";
    }
    return { currentStage, activeLabel, activeVariant, activeError };
  }

  // Parse complete, move to seeding stage
  currentStage = "Seeding";
  activeLabel = seeding.label;
  activeVariant = seeding.variant;
  activeError = seeding.error;

  // Seeding not complete = show seeding-specific state
  if (seeding.status !== "COMPLETED" && seeding.status !== "PARTIAL") {
    if (seeding.status === "QUEUED") {
      activeLabel = "Queued for seeding";
    } else if (seeding.status === "RUNNING") {
      activeLabel = "Seeding knowledge...";
    } else if (!seeding.status) {
      // No seeding job yet (shouldn't happen after parse completes, but handle gracefully)
      activeLabel = "Waiting for seeding";
      activeVariant = "neutral";
    }
    return { currentStage, activeLabel, activeVariant, activeError };
  }

  // Seeding complete/partial = ready
  currentStage = "Ready";
  activeLabel = seeding.status === "PARTIAL" ? "Partially ready" : "Ready";
  activeVariant = seeding.status === "PARTIAL" ? "warning" : "ok";
  activeError = seeding.error;

  return { currentStage, activeLabel, activeVariant, activeError };
}

/** Legacy support - will be deprecated */
export function getUnifiedStatus(d: SourceDocumentRow): { label: string; variant: StatusVariant; error?: string | null } {
  const lifecycle = getDocumentLifecycle(d);
  return {
    label: lifecycle.activeLabel,
    variant: lifecycle.activeVariant,
    error: lifecycle.activeError,
  };
}

export function calculateReadiness(d: SourceDocumentRow): number {
  const lifecycle = getDocumentLifecycle(d);
  // Only return 1.0 for fully completed (not PARTIAL)
  if (lifecycle.currentStage === "Ready" && lifecycle.seeding.status === "COMPLETED") return 1.0;

  let score = 0;
  if (d.uploadStatus === "UPLOADED") score += 0.2;

  const parseJob = d.parseJobs?.[0];
  if (parseJob?.status === "COMPLETED") score += 0.4;

  const seedJob = d.answerSeedingJobs?.[0];
  if (seedJob?.status === "COMPLETED") score += 0.4;
  else if (seedJob?.status === "PARTIAL") score += 0.2;

  return score;
}

export function isDocumentInFlight(d: SourceDocumentRow): boolean {
  const lifecycle = getDocumentLifecycle(d);
  return !lifecycle.isTerminal;
}

export function isDocumentTerminal(d: SourceDocumentRow): boolean {
  const lifecycle = getDocumentLifecycle(d);
  return lifecycle.isTerminal;
}

export function formatFileType(d: SourceDocumentRow): string {
  const mime = d.mimeType.toLowerCase();
  
  if (mime.includes("wordprocessingml.document") || mime.includes("msword")) return "DOCX";
  if (mime === "text/plain") return "TXT";
  if (mime === "application/pdf") return "PDF";
  
  const fromMime = d.mimeType.split("/")[1];
  if (fromMime && fromMime !== "octet-stream") return fromMime.toUpperCase();
  
  const ext = d.originalName.split(".").pop();
  return ext ? ext.toUpperCase() : "FILE";
}

/** Heuristic only — not persisted until schema supports sourceRole. */
export function inferredSourceRole(d: SourceDocumentRow): string {
  const n = d.originalName.toLowerCase();
  if (/soc|iso|gdpr|hipaa|pci|nist|policy|standard/.test(n)) return "Policy / attestation";
  if (/diagram|architecture|network|infra/.test(n)) return "Architecture";
  if (/incident|runbook|procedure|playbook/.test(n)) return "Operations";
  return "General evidence";
}

export function processingSubline(d: SourceDocumentRow): string | null {
  if (d.uploadStatus === "PENDING") return "Finishing upload to secure storage…";
  const job = d.parseJobs?.[0];
  if (!job) return null;
  switch (job.status) {
    case "QUEUED":
      return "Waiting in queue…";
    case "PROCESSING":
      return "Extracting text and structure…";
    default:
      return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRelativeUpdated(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
