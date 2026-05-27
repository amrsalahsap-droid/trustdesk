import { randomUUID } from "node:crypto";
import { logger } from "./logger";

export interface LogContext {
  workspaceId?: string;
  docId?: string;
  correlationId?: string;
  stage?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * ScopedLogger provides a way to carry contextual metadata (like correlation IDs and workspace IDs)
 * across multiple log calls within a logical operation (e.g. a document processing pipeline).
 */
export class ScopedLogger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = {
      correlationId: context.correlationId || `corr-${randomUUID().slice(0, 8)}`,
      ...context,
    };
  }

  /**
   * Returns a new ScopedLogger with additional context merged in.
   */
  withContext(additionalMeta: LogContext): ScopedLogger {
    return new ScopedLogger({
      ...this.context,
      ...additionalMeta,
    });
  }

  debug(message: string, meta?: Record<string, unknown>) {
    logger.debug(message, { ...this.context, ...meta });
  }

  info(message: string, meta?: Record<string, unknown>) {
    logger.info(message, { ...this.context, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>) {
    logger.warn(message, { ...this.context, ...meta });
  }

  error(message: string, meta?: Record<string, unknown>) {
    logger.error(message, { ...this.context, ...meta });
  }

  getContext() {
    return this.context;
  }
}

/**
 * Helper to create a new scoped logger from an initial context.
 */
export function createScopedLogger(context: LogContext = {}): ScopedLogger {
  return new ScopedLogger(context);
}
