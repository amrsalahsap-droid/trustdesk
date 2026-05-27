import { NextResponse } from "next/server";
import { WebsiteAnalysisService } from "@/modules/workspaces/onboarding/website-analysis-service";
import { logger } from "@/lib/logging/logger";

/**
 * POST /api/onboarding/analyze
 * Body: { website: string }
 *
 * Always returns HTTP 200 for logical outcomes (including crawl failures,
 * insufficient evidence, TLS blocks, and schema-invalid AI responses). The
 * client branches on `analysisStatus`. Only unexpected exceptions return 5xx.
 */
export async function POST(request: Request) {
  try {
    const { website, bypassCache, runId } = await request.json();

    if (!website || typeof website !== "string" || !website.trim()) {
      return NextResponse.json(
        { error: "Website URL is required for analysis." },
        { status: 400 },
      );
    }

    logger.info("REAL_ONBOARDING_API_ROUTE_HIT_V2026_05_16: /api/onboarding/analyze POST");
    logger.info("api:onboarding:analyze:start", { website, bypassCache, runId });

    const result = await WebsiteAnalysisService.analyze(website.trim(), bypassCache, runId);

    logger.info("api:onboarding:analyze:result", {
      website,
      analysisStatus: result.analysisStatus,
      pagesScanned: result.pagesScanned.length,
    });

    if (result.analysisStatus === "success" || result.analysisStatus === "needs_review") {
      return NextResponse.json({
        analysisStatus: result.analysisStatus,
        profile: result.profile,
        pagesScanned: result.pagesScanned,
        pageEvidenceSummary: result.pageEvidenceSummary,
        crawlHealth: result.crawlHealth,
        health: result.analysisHealth,
        diagnostics: result.diagnostics,
        intelligenceProfile: result.intelligenceProfile,
      });
    }

    const errorResult = result as any;
    return NextResponse.json({
      analysisStatus: errorResult.analysisStatus,
      reason: errorResult.reason,
      pagesScanned: errorResult.pagesScanned,
      pageEvidenceSummary: "pageEvidenceSummary" in errorResult ? errorResult.pageEvidenceSummary : undefined,
      crawlHealth: errorResult.crawlHealth,
      health: "analysisHealth" in errorResult ? errorResult.analysisHealth : undefined,
      diagnostics: errorResult.diagnostics,
    });
  } catch (err) {
    logger.error("api:onboarding:analyze:exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        analysisStatus: "manual_review_required",
        reason: err instanceof Error ? err.message : "Unexpected analysis failure",
        pagesScanned: [],
        diagnostics: {
          capApplied: false,
          capReason: null,
          preCapConfidence: 0,
          finalTailoringConfidence: 0,
          observedFieldCount: 0,
          groundedSignalCount: 0,
          highSignalCount: 0,
          fieldEvidenceCoverage: {},
          crawlIssues: [],
          signalIssues: [],
          confidenceIssues: [],
          inferenceNotes: ["API exception occurred before analysis completed."],
        },
      },
      { status: 500 },
    );
  }
}
