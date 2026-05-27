import { EmbeddingService } from "@/lib/ai/embedding-service";
import { SimilarityService } from "../search/similarity-service";
import { logger } from "@/lib/logging/logger";
import { TopicMatchingService } from "@/modules/knowledge/topics/topic-matching-service";
import { prisma, uncheckedPrisma } from "@/lib/db/prisma";
import { getSubControls } from "@/modules/knowledge/topics/subcontrol-taxonomy";
import { VerificationStatus } from "@/lib/questionnaires/types";
import { isEligibleForInternalReuse } from "@/lib/knowledge/answer-workflow";
import { freshnessBucket, matcherFreshnessPenalty } from "@/lib/knowledge/answer-freshness";

/**
 * Temporary diagnostics gate. Set QUESTIONNAIRE_DIAG=1 in the env to enable
 * fine-grained per-row tracing of the matching pipeline plus invariant
 * assertions at every DB write boundary.
 */
const DIAG_ENABLED = process.env.QUESTIONNAIRE_DIAG === "1";
function diagLog(level: "info" | "warn" | "error", event: string, meta: Record<string, unknown>) {
  if (!DIAG_ENABLED) return;
  logger[level](event, meta);
}

function isPersistedRowInvariantBroken(data: {
  confidence?: unknown;
  topicId?: unknown;
  suggestedAnswerId?: unknown;
  suggestedAnswer?: unknown;
  sourcesJson?: unknown;
}): string[] {
  const broken: string[] = [];
  const conf = data.confidence;
  if (conf === "high" || conf === "medium") {
    if (data.topicId == null) broken.push(`${conf}_without_topic`);
    if (data.suggestedAnswerId == null && !data.suggestedAnswer) broken.push(`${conf}_without_answer`);
    const sources = Array.isArray(data.sourcesJson) ? (data.sourcesJson as unknown[]) : [];
    if (sources.length === 0) broken.push(`${conf}_without_sources`);
  }
  return broken;
}

export { QuestionnaireMatchingError } from "./questionnaire-matching-errors";
import { QuestionnaireMatchingError as _QuestionnaireMatchingError } from "./questionnaire-matching-errors";

/** Normalizes a MatchingResult so no row can reach the DB claiming medium/high
 *  AI confidence without the downstream evidence chain. */
export function enforceAnswerConfidenceInvariant(result: MatchingResult): {
  result: MatchingResult;
  downgraded: boolean;
} {
  if (result.confidence === "low") return { result, downgraded: false };

  const broken = isPersistedRowInvariantBroken({
    confidence: result.confidence,
    topicId: result.topicId,
    suggestedAnswerId: result.suggestedAnswerId,
    suggestedAnswer: result.suggestedAnswer,
    sourcesJson: result.sources,
  });

  if (broken.length === 0) return { result, downgraded: false };

  return {
    downgraded: true,
    result: {
      ...result,
      confidence: "low",
      reviewed: false,
      status: "unresolved" as any,
      reviewStatus: "unresolved",
      verificationStatus: "UNRESOLVED",
      unresolvedReason: result.unresolvedReason ?? "pipeline_integrity_guard",
    },
  };
}

// --- Day 14 Confidence Weights & Thresholds ---
// --- Recalibrated Confidence Weights & Thresholds ---
const WEIGHTS = {
  TOPIC_SIMILARITY: 0.30,
  ANSWER_SIMILARITY: 0.20, // Reduced library-centricity
  SOURCE_TRUST: 0.15,
  EVIDENCE_BONUS: 0.20, // Rewarding factual grounding
  VERIFIER_BONUS: 0.15, // Rewarding LLM verification pass
};

const THRESHOLDS = {
  HIGH: 0.70,   // More realistic for strong synthesis
  MEDIUM: 0.40  // Allows evidence-backed drafts into review
};

const APPROVED_ACCEPTANCE_THRESHOLD = 0.4;

export interface MatchingResult {
  rowNumber: number;
  topicId: string | null;
  topicName: string | null;
  status: "matched" | "unresolved" | "ambiguous";
  verificationStatus: VerificationStatus;
  suggestedAnswerId: string | null;
  suggestedAnswer: string | null;
  candidates: any[];
  confidence: "high" | "medium" | "low";
  confidenceReasons?: string[];
  reviewed: boolean;
  explanation: string | null;
  sources: any[];
  suggestionStatus: string | null;
  unresolvedReason: string | null;
  synthesisSources: any[];
  provenance: {
    answerOrigin: "approved_reuse" | "subcontrol_synthesis" | "evidence_derived" | "unresolved";
    sourceAnswerIds?: string[];
    sourceSubControlKeys?: string[];
    sourceDocumentIds?: string[];
    synthesisUsed: boolean;
    verifierVerdict: "pass" | "fail" | null;
    evidenceCount?: number;
  };
  isAmbiguous: boolean;
  ambiguityJson: any;
}

export const QuestionnaireMatchingService = {
  /**
   * Enforces AI matching invariants on a single item update.
   * Ensures that if the new state would break invariants (e.g. high confidence but no answer),
   * the confidence is automatically downgraded to 'low'.
   */
  enforceItemInvariants(item: any, updateData: any): any {
    const merged = {
      ...item,
      ...updateData,
    };

    const broken = isPersistedRowInvariantBroken({
      confidence: merged.confidence,
      topicId: merged.topicId,
      suggestedAnswerId: merged.suggestedAnswerId,
      suggestedAnswer: merged.suggestedAnswer,
      sourcesJson: merged.sourcesJson,
    });

    const isAiLowQuality = updateData.isLowQuality === true;

    if (broken.length === 0 && !isAiLowQuality) {
      const { status, ...clean } = updateData as any;
      return clean;
    }

    logger.warn("matching:invariant:broken", {
      itemId: item.id,
      broken,
      isAiLowQuality,
      originalConfidence: item.confidence,
    });

    const result = {
      ...updateData,
      confidence: "low",
      reviewed: false,
      reviewStatus: "unresolved",
      verificationStatus: "UNRESOLVED",
      unresolvedReason: isAiLowQuality ? "ai_low_quality" : (merged.unresolvedReason ?? "pipeline_integrity_guard"),
    };
    const { status, ...clean } = result as any;
    return clean;
  },

  cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const mag = Math.sqrt(normA) * Math.sqrt(normB);
    return mag === 0 ? 0 : dotProduct / mag;
  },

  async matchRows(workspaceId: string, rows: any[], tone?: string): Promise<Map<number, MatchingResult>> {
    const results = new Map<number, MatchingResult>();
    const startTime = performance.now();
    const questionRows = rows.filter(r => r.type === "question_row" && r.question?.trim());
    if (questionRows.length === 0) return results;

    try {
      const questionTexts = questionRows.map(r => r.question);
      const vectors = await EmbeddingService.getEmbeddings(questionTexts);

      const [allLibraryItems, workspaceTopics, systemTopics, legacyGlobalTopics] = await Promise.all([
        prisma.answerLibraryItem.findMany({
          where: { workspaceId, embedding: { isEmpty: false }, status: { not: "ARCHIVED" } },
          include: { topic: true, _count: { select: { evidence: true } } },
        }),
        prisma.knowledgeTopic.findMany({ where: { workspaceId, embedding: { isEmpty: false } } }),
        prisma.knowledgeTopic.findMany({ where: { workspaceId: "SYSTEM_WORKSPACE", embedding: { isEmpty: false } } }),
        uncheckedPrisma.knowledgeTopic.findMany({ where: { workspaceId: null, embedding: { isEmpty: false } } }),
      ]);
      const allTopics = [...workspaceTopics, ...systemTopics, ...legacyGlobalTopics];

      const { AnswerFitnessService } = await import("@/modules/workspaces/intelligence/answer-fitness-service");
      const { AnswerGenerationService } = await import("@/modules/workspaces/intelligence/answer-generation-service");

      const intermediateResults: any[] = [];
      const suggestedAnswerIds = new Set<string>();

      for (let i = 0; i < questionRows.length; i++) {
        const row = questionRows[i];
        try {
          logger.info("matching:row:start", { rowNumber: row.rowNumber });
          const vector = vectors[i];
          const now = new Date();
          let rowUnresolvedReason: string | null = null;
          if ((row.confidence as string | undefined) === "low") rowUnresolvedReason = "mapping_weakness";

        // 1. Topic Matching
        const topicMatches = allTopics.map(t => ({
          item: t,
          score: this.cosineSimilarity(vector, t.embedding as number[])
        })).sort((a, b) => b.score - a.score);

        const bestTopic = topicMatches[0];
        const runnerUpTopic = topicMatches[1];
        let topicStatus: 'matched' | 'unresolved' | 'ambiguous' = 'unresolved';
        const isTopicAmbiguous = bestTopic && runnerUpTopic && (bestTopic.score - runnerUpTopic.score) < 0.05 && bestTopic.score > 0.35;

        if (bestTopic && bestTopic.score >= 0.4) {
          topicStatus = isTopicAmbiguous ? 'ambiguous' : 'matched';
        }

        const topicId = (topicStatus !== 'unresolved') ? bestTopic.item.id : null;
        const topicName = topicStatus === 'ambiguous' 
          ? [bestTopic.item.name, runnerUpTopic?.item.name].filter(Boolean).join(' / ')
          : bestTopic?.item.name || null;
        const topicScore = bestTopic?.score || 0;

        // 2. Answer Library Matching
        const answerMatches = allLibraryItems.map((item) => {
          let score = this.cosineSimilarity(vector, item.embedding as number[]);
          if (topicId && item.topicId === topicId) score += 0.05;
          if (isEligibleForInternalReuse(item)) score += 0.1;
          score += matcherFreshnessPenalty(
            freshnessBucket(now, {
              status: item.status,
              governanceStatus: item.governanceStatus,
              nextReviewDueAt: item.nextReviewDueAt,
            }),
          );
          return { item, score };
        }).sort((a, b) => b.score - a.score).slice(0, 5);

        const bestApproved = topicId
          ? answerMatches.find((m) => isEligibleForInternalReuse(m.item) && m.item.topicId === topicId)
          : undefined;

        const answerScore = Math.max(0, bestApproved?.score || 0);

        // 3. Candidate Selection
        let suggestedAnswer = (bestApproved && answerScore > APPROVED_ACCEPTANCE_THRESHOLD) ? bestApproved.item.answer : null;
        let suggestedAnswerId = (bestApproved && answerScore > APPROVED_ACCEPTANCE_THRESHOLD) ? bestApproved.item.id : null;
        let selectedEvidenceCount = suggestedAnswerId ? bestApproved?.item._count.evidence ?? 0 : 0;
        let isSynthetic = false;
        let usedSubControlSynthesis = false;
        let answerOrigin: "approved_reuse" | "subcontrol_synthesis" | "evidence_derived" | "unresolved" = "unresolved";
        let sourceAnswerIds: string[] = [];
        let sourceSubControlKeys: string[] = [];
        let sourceDocumentIds: string[] = [];

        if (suggestedAnswerId) {
          answerOrigin = "approved_reuse";
          sourceAnswerIds = [suggestedAnswerId];
        }

        // 4. Sub-control Synthesis
        let isSubControlAmbiguous = false;
        let subControlCandidatesDiag: any[] = [];
        const topicKeyForRow = allTopics.find(t => t.id === topicId)?.key ?? null;
        const hasSubControlTaxonomy = topicKeyForRow ? getSubControls(topicKeyForRow).length > 0 : false;
        if (topicId && hasSubControlTaxonomy) {
          const topicApproved = allLibraryItems.filter(
            (item) => isEligibleForInternalReuse(item) && item.topicId === topicId,
          );
          const ranked = topicApproved
            .map((item) => ({
              item,
              cosine:
                this.cosineSimilarity(vector, item.embedding as number[]) +
                matcherFreshnessPenalty(
                  freshnessBucket(now, {
                    status: item.status,
                    governanceStatus: item.governanceStatus,
                    nextReviewDueAt: item.nextReviewDueAt,
                  }),
                ),
            }))
            .sort((a, b) => b.cosine - a.cosine);
          subControlCandidatesDiag = ranked.map(r => ({ key: r.item.subControlKey, score: r.cosine }));

          if (ranked.length > 0) {
            const top = ranked[0];
            const second = ranked[1];
            isSubControlAmbiguous = second && (top.cosine - second.cosine) < 0.08 && top.cosine > 0.4;

            if (top.cosine >= 0.75 && (!second || top.cosine - second.cosine >= 0.08)) {
              suggestedAnswer = top.item.answer;
              suggestedAnswerId = top.item.id;
              selectedEvidenceCount = top.item._count.evidence ?? 0;
              answerOrigin = "approved_reuse";
              sourceAnswerIds = [top.item.id];
            } else {
              const topK = ranked.slice(0, 3).filter(c => c.cosine >= 0.35);
              if (topK.length > 0) {
                const composed = await AnswerGenerationService.composeFromSubControls({
                  question: row.question, topicName, subControls: topK.map(c => ({
                    subControlKey: c.item.subControlKey ?? null, subControlLabel: c.item.subControlLabels?.[0] ?? null,
                    answer: c.item.answer ?? "", answerId: c.item.id, cosine: c.cosine,
                  })), workspaceId, tone
                });
                if (!composed.isLowQuality && composed.answer) {
                  suggestedAnswer = composed.answer;
                  suggestedAnswerId = null;
                  isSynthetic = true;
                  usedSubControlSynthesis = true;
                  answerOrigin = "subcontrol_synthesis";
                  sourceAnswerIds = topK.map(c => c.item.id);
                  sourceSubControlKeys = topK.map(c => c.item.subControlKey).filter((k): k is string => !!k);
                } else if (composed.answer) {
                  suggestedAnswer = composed.answer;
                  isSynthetic = true;
                  rowUnresolvedReason = "low_quality_draft";
                  answerOrigin = "subcontrol_synthesis";
                }
              }
            }
          }
        }

        // 5. Answer Fitness Verification
        let fitnessVerdictLabel: "pass" | "fail" | null = null;
        if (suggestedAnswer && topicId) {
          const verdict = await AnswerFitnessService.verify({
            question: row.question, answer: suggestedAnswer,
            topicKey: allTopics.find(t => t.id === topicId)?.key ?? null,
            answerId: suggestedAnswerId ?? `synthetic:${row.rowNumber}`,
            workspaceId,
          });
          fitnessVerdictLabel = verdict.verdict;
          if (verdict.verdict === "fail") {
            suggestedAnswer = null;
            suggestedAnswerId = null;
            isSynthetic = false;
          }
        }

        // 6. Evidence-only Synthesis
        let synthesisSources: any[] = [];
        if (!suggestedAnswer && topicId && topicScore > 0.4) {
          try {
            const synth = await AnswerGenerationService.generate(row.question, workspaceId, tone);
            if (!synth.isLowQuality) {
              suggestedAnswer = synth.answer;
              isSynthetic = true;
              answerOrigin = "evidence_derived";
              sourceDocumentIds = synth.sources.map(s => s.chunkId);
              synthesisSources = synth.sources.map(s => ({ quote: s.quote || "Evidence.", documentName: s.docName, documentId: s.chunkId }));
            } else if (synth.answer) {
              suggestedAnswer = synth.answer;
              isSynthetic = true;
              rowUnresolvedReason = "low_quality_draft";
              answerOrigin = "evidence_derived";
              synthesisSources = synth.sources.map(s => ({ quote: s.quote || "Evidence.", documentName: s.docName, documentId: s.chunkId }));
            }
          } catch (err) { /* ignore */ }
        }

        // 7. Final Confidence & Workflow State
        const confidenceReasons: string[] = [];
        const S_topic = Math.max(0, Math.min(1.0, topicScore));
        if (S_topic >= 0.8) confidenceReasons.push("strong_topic_match");
        const S_answer = Math.max(0, Math.min(1.0, answerScore));
        if (S_answer >= 0.8) confidenceReasons.push("strong_semantic_match");
        const evidenceCount = selectedEvidenceCount || synthesisSources.length;
        // Grounded Trust: Synthesis from approved library (0.15) OR high-fidelity evidence (0.10)
        let B_trust = 0.0;
        if ((suggestedAnswerId != null && !isSynthetic) || (isSynthetic && (sourceAnswerIds.length > 0 || sourceSubControlKeys.length > 0))) {
          B_trust = 1.0;
          confidenceReasons.push(isSynthetic ? "synthesized_from_approved" : "approved_library_match");
        } else if (isSynthetic && evidenceCount >= 3) {
          B_trust = 0.65; // High-fidelity evidence trust (approx 0.10 points)
          confidenceReasons.push("grounded_synthesis");
        }
        
        const B_evid = evidenceCount > 0 ? 1.0 : 0.0;
        if (B_evid > 0) confidenceReasons.push("evidence_backed");
        const B_verif = fitnessVerdictLabel === "pass" ? 1.0 : 0.0;
        if (B_verif > 0) confidenceReasons.push("verifier_pass");

        const compoundScore = (S_topic * WEIGHTS.TOPIC_SIMILARITY) + 
                              (S_answer * WEIGHTS.ANSWER_SIMILARITY) + 
                              (B_trust * WEIGHTS.SOURCE_TRUST) + 
                              (B_evid * WEIGHTS.EVIDENCE_BONUS) + 
                              (B_verif * WEIGHTS.VERIFIER_BONUS);
        let confidence: "high" | "medium" | "low" = "low";
        if (compoundScore >= THRESHOLDS.HIGH) confidence = "high";
        else if (compoundScore >= THRESHOLDS.MEDIUM) confidence = "medium";
        
        // --- Day 14 Workflow State Separation & Ambiguity Handling ---
        const isAmbiguous = isTopicAmbiguous || isSubControlAmbiguous;
        const isAutoResolved = confidence === "high" && !!suggestedAnswer && !!topicId && !isAmbiguous;
        
        let unresolvedReason: string | null = null;
        let workflowStatus: VerificationStatus = "SUGGESTED";

        if (isAmbiguous) {
          workflowStatus = "AMBIGUOUS_MATCH";
        } else if (isAutoResolved) {
          workflowStatus = "SUGGESTED";
        } else {
          if (!topicId) {
            unresolvedReason = "missing_topic";
            workflowStatus = "UNRESOLVED";
          } else if (!suggestedAnswer) {
            unresolvedReason = rowUnresolvedReason ?? "no_approved_answer";
            workflowStatus = "UNRESOLVED";
          } else if (confidence === "low") {
            unresolvedReason = rowUnresolvedReason ?? "low_confidence";
            workflowStatus = "UNRESOLVED";
          } else if (fitnessVerdictLabel === "fail") {
            unresolvedReason = "answer_fitness_failed";
            workflowStatus = "UNRESOLVED";
          } else if (confidence === "medium") {
            workflowStatus = "NEEDS_REVIEW";
            unresolvedReason = fitnessVerdictLabel === "pass" ? null : "provisional_draft";
          }
        }

        const ambiguityJson = isAmbiguous ? {
          reason: isTopicAmbiguous ? "competing_topics" : "competing_subcontrols",
          competingTopics: isTopicAmbiguous ? topicMatches.slice(0, 3).map(m => ({ id: m.item.id, name: m.item.name, score: m.score })) : undefined,
          competingSubControls: isSubControlAmbiguous ? subControlCandidatesDiag?.slice(0, 3) : undefined,
          severity: (
            (isTopicAmbiguous && (bestTopic.score - (runnerUpTopic?.score || 0)) < 0.02) ||
            (isSubControlAmbiguous && ((subControlCandidatesDiag?.[0]?.score || 0) - (subControlCandidatesDiag?.[1]?.score || 0)) < 0.03)
          ) ? "high" : "medium"
        } : null;

        const debugSignals = `[T:${(S_topic * WEIGHTS.TOPIC_SIMILARITY).toFixed(2)}, A:${(S_answer * WEIGHTS.ANSWER_SIMILARITY).toFixed(2)}, ST:${(B_trust * WEIGHTS.SOURCE_TRUST).toFixed(2)}, ED:${(B_evid * WEIGHTS.EVIDENCE_BONUS).toFixed(2)}, V:${(B_verif * WEIGHTS.VERIFIER_BONUS).toFixed(2)}] = ${compoundScore.toFixed(2)}`;
        
        intermediateResults.push({
          rowNumber: row.rowNumber, topicId, topicName, suggestedAnswer, suggestedAnswerId,
          candidates: answerMatches.map((m) => ({
            id: m.item.id,
            answer: m.item.answer,
            score: m.score,
            isApproved: isEligibleForInternalReuse(m.item),
          })),
          confidence, confidenceReasons, verificationStatus: workflowStatus,
          isAmbiguous, ambiguityJson,
          explanation: `${isAmbiguous ? "[AMBIGUOUS] " : ""}${suggestedAnswer ? "Generated suggestion." : "No suggestion."} | ${debugSignals}`,
          reviewed: isAutoResolved, status: isAutoResolved || isSynthetic ? "matched" : "unresolved",
          suggestionStatus: workflowStatus, unresolvedReason, synthesisSources,
          answerOrigin,
          usedSubControlSynthesis,
          provenance: { 
            answerOrigin, 
            synthesisUsed: isSynthetic, 
            verifierVerdict: fitnessVerdictLabel,
            evidenceCount,
            sourceAnswerIds,
            sourceSubControlKeys,
            sourceDocumentIds
          }
        });
        if (suggestedAnswerId) suggestedAnswerIds.add(suggestedAnswerId);
        } catch (err) {
          logger.error("matching:row:failed", { 
            rowNumber: row.rowNumber, 
            error: err instanceof Error ? err.message : String(err) 
          });
        }
      }

      // 8. Bulk Evidence Retrieval
      const evidenceMap = new Map<string, any[]>();
      if (suggestedAnswerIds.size > 0) {
        const allEv = await prisma.answerEvidence.findMany({
          where: { workspaceId, answerId: { in: Array.from(suggestedAnswerIds) } },
          include: { chunk: { include: { sourceDocument: { select: { id: true, fileName: true } } } } },
        });
        for (const ev of allEv) {
          const list = evidenceMap.get(ev.answerId) || [];
          list.push({ quote: ev.quote || ev.chunk.content, documentName: ev.chunk.sourceDocument.fileName, documentId: ev.chunk.sourceDocument.id });
          evidenceMap.set(ev.answerId, list);
        }
      }

      for (const ir of intermediateResults) {
        const sources = ir.suggestedAnswerId ? evidenceMap.get(ir.suggestedAnswerId) || [] : [];
        const base: MatchingResult = { ...ir, sources: ir.synthesisSources?.length > 0 ? ir.synthesisSources : sources };
        const { result: guarded } = enforceAnswerConfidenceInvariant(base);
        results.set(ir.rowNumber, guarded);
      }

      return results;
    } catch (err) {
      logger.error("questionnaire:matching:failed", { error: String(err) });
      throw new _QuestionnaireMatchingError(err instanceof Error ? err.message : String(err));
    }
  },

  async getGapSummary(workspaceId: string, questionnaireId: string) {
    const [counts, gaps, confidenceCounts, answerStats] = await Promise.all([
      prisma.questionnaireItem.groupBy({ by: ['verificationStatus', 'reviewed'], where: { workspaceId, questionnaireId, type: "question_row" }, _count: true }),
      prisma.gapFlag.groupBy({ by: ['gapType'], where: { workspaceId, questionnaireId }, _count: true }),
      prisma.questionnaireItem.groupBy({ by: ['confidence'], where: { workspaceId, questionnaireId, type: "question_row" }, _count: true }),
      prisma.questionnaireItem.aggregate({ where: { workspaceId, questionnaireId, type: "question_row" }, _count: { suggestedAnswerId: true } })
    ]);
    
    const synthCount = await prisma.questionnaireItem.count({ where: { workspaceId, questionnaireId, type: "question_row", suggestedAnswerId: null, suggestedAnswer: { not: "" } } });
    const total = counts.reduce((acc, curr) => acc + curr._count, 0);
    const reviewed = counts.filter(c => c.reviewed).reduce((acc, curr) => acc + curr._count, 0);
    
    const gapBreakdown: Record<string, number> = {};
    gaps.forEach(g => { gapBreakdown[g.gapType] = g._count; });

    const confidenceBreakdown = confidenceCounts.reduce((acc, curr) => {
      acc[curr.confidence || 'low'] = curr._count;
      return acc;
    }, {} as Record<string, number>);

    const hasAnswerCount = await prisma.questionnaireItem.count({ 
      where: { 
        workspaceId, questionnaireId, type: "question_row", 
        OR: [{ suggestedAnswer: { not: "" } }, { finalAnswer: { not: "" } }] 
      } 
    });

    return {
      total, 
      reviewed, 
      unresolved: total - reviewed, 
      gaps: gapBreakdown,
      libraryBackedCount: answerStats._count.suggestedAnswerId, 
      synthesizedCount: synthCount,
      hasAnswerCount,
      noAnswerCount: total - hasAnswerCount,
      confidenceBreakdown,
      statusBreakdown: counts.reduce((acc, curr) => { 
        acc[curr.verificationStatus] = (acc[curr.verificationStatus] || 0) + curr._count; 
        return acc; 
      }, {} as Record<string, number>)
    };
  },

  async syncGapFlags(tx: any, workspaceId: string, questionnaireId: string, itemId: string, unresolvedReason: string | null, explanation: string | null) {
    await tx.gapFlag.deleteMany({ where: { workspaceId, questionnaireItemId: itemId } });
    if (unresolvedReason) {
      const displayExplanation = explanation ? (explanation.split(" | ")[1] || explanation) : null;
      await tx.gapFlag.create({ data: { workspaceId, questionnaireId, questionnaireItemId: itemId, gapType: unresolvedReason, explanation: displayExplanation } });
    }
  },

  /**
   * Safe logic for Day 2 Hardenining (D2-EN-01):
   * finalAnswer represents the definitive, export-ready answer. Once a user has
   * made an explicit selection (imported, suggested, edited), the system must
   * stop automatically overwriting finalAnswer during background re-matching.
   *
   * returns true ONLY when finalAnswerSelection is null/undefined.
   */
  canUpdateFinalAnswerFromMatching(item: { finalAnswerSelection: string | null }) {
    return item.finalAnswerSelection === null;
  },

  async applyResultsToDatabase(workspaceId: string, questionnaireId: string, results: Map<number, MatchingResult>) {
    await prisma.$transaction(async (tx) => {
      const currentItems = await tx.questionnaireItem.findMany({ 
        where: { workspaceId, questionnaireId }, 
        include: { questionnaire: true } 
      });
      logger.info("questionnaire:matching:apply:items_loaded", { count: currentItems.length });

      const itemUpdates: Promise<any>[] = [];
      const itemIdsToSync: string[] = [];
      const gapFlagsToCreate: any[] = [];

      for (const item of currentItems) {
        if (item.rowNumber === null) continue;
        const rawMatch = results.get(item.rowNumber);
        if (!rawMatch) continue;

        const { result: match } = enforceAnswerConfidenceInvariant({ 
          ...rawMatch, 
          sources: Array.isArray(rawMatch.sources) ? rawMatch.sources : [] 
        });

        const status = item.verificationStatus as string;
        const isHumanDecision = ["ACCEPTED", "REJECTED", "EDITED", "MANUAL_OVERRIDE"].includes(status);
        const hasManualEdit = !!item.finalAnswer && item.finalAnswer !== item.suggestedAnswer;

        const updateData: any = {
          suggestedAnswer: match.suggestedAnswer || "",
          suggestedAnswerId: match.suggestedAnswerId,
          topicId: match.topicId,
          topicName: match.topicName,
          candidatesJson: match.candidates,
          reviewSummary: match.explanation,
          suggestionStatus: match.suggestionStatus,
          sourcesJson: match.sources,
          provenanceJson: match.provenance,
          reviewStatus: match.status,
          unresolvedReason: match.unresolvedReason,
          isAmbiguous: match.isAmbiguous,
          ambiguityJson: match.ambiguityJson,
        };

        const canUpdateFinalAnswer = this.canUpdateFinalAnswerFromMatching(item as any);
        if (canUpdateFinalAnswer) {
          updateData.finalAnswer = match.suggestedAnswer || "";
        }

        if (!isHumanDecision) {
          updateData.confidence = match.confidence;
          updateData.reviewed = match.reviewed;
          updateData.verificationStatus = match.verificationStatus;
        }

        itemIdsToSync.push(item.id);
        itemUpdates.push(tx.questionnaireItem.update({ 
          where: { id: item.id, workspaceId }, 
          data: updateData 
        }));

        if (match.unresolvedReason) {
          const displayExplanation = match.explanation ? (match.explanation.split(" | ")[1] || match.explanation) : null;
          gapFlagsToCreate.push({
            workspaceId,
            questionnaireId,
            questionnaireItemId: item.id,
            gapType: match.unresolvedReason,
            explanation: displayExplanation
          });
        }
      }

      // 1. Batch execute QuestionnaireItem updates
      // Using Promise.all inside the transaction to ensure they all run in parallel but within the same TX
      await Promise.all(itemUpdates);

      // 2. Batch sync GapFlags
      // First delete all existing gap flags for the items we are updating
      await tx.gapFlag.deleteMany({
        where: { workspaceId, questionnaireItemId: { in: itemIdsToSync } }
      });

      // Then create new ones in bulk
      if (gapFlagsToCreate.length > 0) {
        await tx.gapFlag.createMany({
          data: gapFlagsToCreate
        });
      }

      logger.info("questionnaire:matching:applied", { workspaceId, questionnaireId, count: currentItems.length });
    }, { timeout: 60000 }); // Increased timeout for bulk operations
    void (async () => {
      try {
        const { aiConfig } = await import("@/lib/ai/ai-config-service");
        if (!aiConfig.isDiscoveryEnabled) return;
        const { GapDiscoveryService } = await import("@/modules/knowledge/topics/gap-discovery-service");
        await GapDiscoveryService.discoverTopicsFromGaps(workspaceId);
      } catch (err) { 
        logger.warn("questionnaire:matching:background_discovery_failed", { error: String(err) });
      }
    })();
  }
};
