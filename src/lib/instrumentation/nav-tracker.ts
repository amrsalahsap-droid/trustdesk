
import { logger } from "@/lib/logging/logger";

export type NavEvent = 
  | "nav.click"
  | "nav.route.start"
  | "nav.middleware.start"
  | "nav.middleware.done"
  | "nav.auth.start"
  | "nav.auth.done"
  | "nav.workspace.resolve.start"
  | "nav.workspace.resolve.done"
  | "nav.server.done"
  | "nav.hydration.start"
  | "nav.hydration.done"
  | "nav.render.success"
  | "nav.render.error"
  | "counts.start"
  | "counts.done"
  | "page.data.start"
  | "page.data.done";

export function trackNav(
  event: NavEvent, 
  meta: { 
    correlationId: string;
    route: string;
    userId?: string;
    workspaceId?: string;
    duration?: number;
    error?: string;
    [key: string]: unknown;
  }
) {
  logger.info(event, meta);
}
