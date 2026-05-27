/**
 * Domain Intelligence Pipeline Logger
 * 
 * Provides structured logging for domain intelligence pipeline operations
 * with correlation IDs and comprehensive context tracking.
 */

import { randomUUID } from "crypto";

export interface LogContext {
  correlationId: string;
  domain?: string;
  url?: string;
  statusCode?: number;
  pageType?: string;
  duration?: number;
  error?: string;
  [key: string]: any;
}

export interface CrawlLogContext extends LogContext {
  totalPagesAttempted?: number;
  totalPagesFetched?: number;
  totalPagesSuccessful?: number;
  highValuePagesFound?: number;
  securityLegalPagesFound?: number;
  totalUsefulChars?: number;
  sitemapUrlsDiscovered?: number;
  crawlDuration?: number;
  stagedDiagnostics?: {
    stageAllocation: Record<number, number>;
    trustPagesAttempted: number;
    trustPagesSkipped: number;
    reservedBudgetUsage: number;
  };
  budgetUsage?: {
    attemptsUsed: number;
    evidencePagesFound: number;
    trustEvidenceFound: number;
    remainingAttempts: number;
    remainingEvidenceSlots: number;
  };
  issues?: Array<{
    type: "error" | "warning" | "info";
    message: string;
    url?: string;
  }>;
}

export interface EvidenceLogContext extends LogContext {
  evidenceType?: string;
  candidateValue?: string;
  signalType?: string;
  strength?: string;
  confidenceScore?: number;
  snippet?: string;
  sourceUrl?: string;
}

export interface DecisionLogContext extends LogContext {
  fieldKey?: string;
  candidateValue?: string;
  supportScore?: number;
  confidenceBand?: string;
  evidenceCoverage?: number;
  isConflicted?: boolean;
  conflictingSignals?: number;
}

/**
 * Generate correlation ID for tracking operations
 */
export function generateCorrelationId(): string {
  return `corr-${randomUUID().slice(0, 8)}`;
}

/**
 * Log crawl start event
 */
export function logCrawlStart(domain: string, config?: any): void {
  const context: LogContext = {
    correlationId: generateCorrelationId(),
    domain,
    level: "info",
    message: "crawl-started",
    data: {
      config,
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log URL attempt
 */
export function logUrlAttempt(correlationId: string, url: string, domain: string): void {
  const context: LogContext = {
    correlationId,
    domain,
    url,
    level: "info",
    message: "url-attempted",
    data: {
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log URL success
 */
export function logUrlSuccess(
  correlationId: string,
  url: string,
  domain: string,
  statusCode: number,
  pageType: string,
  duration: number
): void {
  const context: LogContext = {
    correlationId,
    domain,
    url,
    statusCode,
    pageType,
    duration,
    level: "info",
    message: "url-success",
    data: {
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log URL failure
 */
export function logUrlFailure(
  correlationId: string,
  url: string,
  domain: string,
  error: string,
  statusCode?: number
): void {
  const context: LogContext = {
    correlationId,
    domain,
    url,
    statusCode,
    level: "error",
    message: "url-failure",
    error,
    data: {
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log sitemap discovery
 */
export function logSitemapDiscovery(
  correlationId: string,
  domain: string,
  urlsDiscovered: number
): void {
  const context: LogContext = {
    correlationId,
    domain,
    level: "info",
    message: "sitemap-discovered",
    data: {
      urlsDiscovered,
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log page classification
 */
export function logPageClassification(
  correlationId: string,
  url: string,
  domain: string,
  pageType: string,
  usefulnessScore: number
): void {
  const context: LogContext = {
    correlationId,
    domain,
    url,
    pageType,
    level: "info",
    message: "page-classified",
    data: {
      usefulnessScore,
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log evidence signal extraction
 */
export function logEvidenceExtraction(
  correlationId: string,
  domain: string,
  evidenceType: string,
  candidateValue: string,
  signalType: string,
  strength: string,
  confidenceScore: number,
  snippet: string,
  sourceUrl: string
): void {
  const context: EvidenceLogContext = {
    correlationId,
    domain,
    evidenceType,
    candidateValue,
    signalType,
    strength,
    confidenceScore,
    snippet,
    sourceUrl,
    level: "info",
    message: "evidence-extracted",
    data: {
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log Trust Profile decision
 */
export function logDecision(
  correlationId: string,
  domain: string,
  fieldKey: string,
  candidateValue: string,
  supportScore: number,
  confidenceBand: string,
  evidenceCoverage: number,
  isConflicted: boolean,
  conflictingSignals: number = 0
): void {
  const context: DecisionLogContext = {
    correlationId,
    domain,
    fieldKey,
    candidateValue,
    supportScore,
    confidenceBand,
    evidenceCoverage,
    isConflicted,
    conflictingSignals,
    level: "info",
    message: "decision-computed",
    data: {
      timestamp: new Date().toISOString(),
    },
  };
  
  writeStructuredLog(context);
}

/**
 * Log crawl completion
 */
export function logCrawlComplete(correlationId: string, context: CrawlLogContext): void {
  writeStructuredLog({
    correlationId,
    level: "info",
    message: "crawl-completed",
    data: {
      timestamp: new Date().toISOString(),
      ...context,
    },
  });
}

/**
 * Log profile scoring completion
 */
export function logProfileScoringComplete(correlationId: string, domain: string): void {
  writeStructuredLog({
    correlationId,
    domain,
    level: "info",
    message: "profile-scoring-completed",
    data: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Write structured log to console
 */
function writeStructuredLog(context: LogContext): void {
  const logEntry = {
    timestamp: context.data?.timestamp || new Date().toISOString(),
    correlationId: context.correlationId,
    domain: context.domain,
    url: context.url,
    statusCode: context.statusCode,
    pageType: context.pageType,
    level: context.level || "info",
    message: context.message,
    error: context.error,
    data: context.data,
  };

  // In development, log to console with structured format
  if (process.env.NODE_ENV === "development") {
    console.log(JSON.stringify(logEntry));
  }
  
  // In production, this would integrate with proper logging service
  // For now, we'll use console for visibility
}

/**
 * Log pipeline error
 */
export function logPipelineError(
  correlationId: string,
  domain: string,
  stage: string,
  error: string,
  context?: Record<string, any>
): void {
  writeStructuredLog({
    correlationId,
    domain,
    level: "error",
    message: "pipeline-error",
    error,
    data: {
      stage,
      timestamp: new Date().toISOString(),
      ...context,
    },
  });
}
