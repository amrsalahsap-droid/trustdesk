import { logger } from "@/lib/logging/logger";
import type { Browser, Route } from "playwright-core";

export type RenderedPage = {
  html: string;
  text: string;
  title: string;
  renderedMs: number;
  blockedRequests: number;
};

const TRACKER_HOST_RE =
  /googletagmanager|doubleclick|google-analytics|segment\.|cdn\.segment|hotjar|facebook\.|connect\.facebook|analytics\.|mixpanel|fullstory|clarity\.ms|intercomcdn|browser-intake-datadog|sentry\.io|newrelic|optimizely|hubspot|hs-scripts|hs-banner|pardot|marketo|zoominfo|6sense/i;

function shouldBlockRequest(url: string, resourceType: string): boolean {
  if (["image", "media", "font"].includes(resourceType)) return true;
  try {
    const host = new URL(url).hostname;
    if (TRACKER_HOST_RE.test(host)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Headless Chromium snapshot for onboarding rescue path. Uses dynamic import so
 * installs without browsers still typecheck; callers catch failures.
 */
export class RenderedFetchService {
  static async withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
    let chromium: typeof import("playwright-core").chromium;
    try {
      const pw = await import("playwright-core");
      chromium = pw.chromium;
    } catch (e) {
      logger.warn("onboarding:analyze:rendered-unavailable", {
        reason: "playwright-import-failed",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    let browser: Browser;
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      logger.warn("onboarding:analyze:rendered-unavailable", {
        reason: "chromium-launch-failed",
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    try {
      return await fn(browser);
    } finally {
      await browser.close().catch(() => {});
    }
  }

  /**
   * Renders `url` with bounded waits; returns scrubbed HTML suitable for {@link extractStructuredEvidence}.
   */
  static async render(browser: Browser, url: string, opts?: { timeoutMs?: number }): Promise<RenderedPage | null> {
    const started = Date.now();
    const hardCap = Math.min(opts?.timeoutMs ?? 10_000, 10_000);
    let blockedRequests = 0;

    const context = await browser.newContext({
      userAgent: "TrustDesk-Onboarding-Scanner/3.1 (Rendered-Fallback)",
    });
    const page = await context.newPage();

    await page.route("**/*", (route: Route) => {
      const req = route.request();
      if (shouldBlockRequest(req.url(), req.resourceType())) {
        blockedRequests++;
        return route.abort();
      }
      return route.continue();
    });

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 9_000 });
      await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});

      const snapshot = await page.evaluate(() => {
        const root =
          document.querySelector("main") ?? document.querySelector("article") ?? document.body;
        if (!root) {
          return { html: "", text: "", title: document.title || "" };
        }

        const walkVisibleText = (el: Element): string[] => {
          const out: string[] = [];
          const isVisible = (node: Element) => {
            const h = node as HTMLElement;
            if (typeof h.offsetParent === "undefined") return true;
            return h.offsetParent !== null || h.tagName === "BODY";
          };

          const visit = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const t = node.textContent?.trim();
              if (t) out.push(t);
              return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as Element;
            const tag = el.tagName;
            if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG"].includes(tag)) return;
            if (!isVisible(el)) return;
            for (const c of el.childNodes) visit(c);
          };

          visit(el);
          return out;
        };

        const clone = root.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script,style,noscript,svg").forEach((n) => n.remove());
        const html = clone.innerHTML;
        const text = walkVisibleText(clone).join(" ").replace(/\s+/g, " ").trim();
        return { html, text, title: document.title || "" };
      });

      const elapsed = Date.now() - started;
      if (elapsed > hardCap) {
        logger.info("onboarding:analyze:render-timeout-soft", { url, elapsedMs: elapsed });
      }

      return {
        html: `<html><head><title>${escapeHtml(snapshot.title)}</title></head><body>${snapshot.html}</body></html>`,
        text: snapshot.text,
        title: snapshot.title,
        renderedMs: elapsed,
        blockedRequests,
      };
    } catch (e) {
      logger.warn("onboarding:analyze:render-page-failed", {
        url,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    } finally {
      await context.close().catch(() => {});
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
