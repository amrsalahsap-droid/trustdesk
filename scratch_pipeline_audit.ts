import { prisma, uncheckedPrisma } from "./src/lib/db/prisma";
import { QuestionnaireMatchingService } from "./src/modules/workspaces/intelligence/questionnaire-matching-service";
import { EmbeddingService } from "./src/lib/ai/embedding-service";
import { AnswerGenerationService } from "./src/modules/workspaces/intelligence/answer-generation-service";
import { AnswerFitnessService } from "./src/modules/workspaces/intelligence/answer-fitness-service";
import { getSubControls } from "./src/modules/knowledge/topics/subcontrol-taxonomy";

async function inspectRow(workspaceId: string, questionnaireId: string, rowNumber: number, allLibraryItems: any[], allTopics: any[]) {
    console.log(`\n--- INSPECTING ROW ${rowNumber} ---`);
    
    const item = await prisma.questionnaireItem.findFirst({
        where: { questionnaireId, rowNumber, workspaceId }
    });

    if (!item) {
        console.log(`[ERROR] Row ${rowNumber} not found in DB`);
        return;
    }

    console.log(`Question: ${item.question}`);
    console.log(`Current DB State:`);
    console.log(`  topicId: ${item.topicId}`);
    console.log(`  topicName: ${item.topicName}`);
    console.log(`  suggestedAnswer: "${item.suggestedAnswer}"`);
    console.log(`  finalAnswer: "${item.finalAnswer}"`);
    console.log(`  unresolvedReason: ${item.unresolvedReason}`);
    console.log(`  confidence: ${item.confidence}`);

    // 1. Generate Embedding
    const [vector] = await EmbeddingService.getEmbeddings([item.question]);
    
    // 2. Topic Match
    const topicMatches = allTopics.map(t => ({
        item: t,
        score: QuestionnaireMatchingService.cosineSimilarity(vector, t.embedding as number[])
    })).sort((a, b) => b.score - a.score);

    const bestTopic = topicMatches[0];
    const runnerUpTopic = topicMatches[1];
    let topicStatus = 'unresolved';
    if (bestTopic && bestTopic.score >= 0.4) {
        topicStatus = (runnerUpTopic && (bestTopic.score - runnerUpTopic.score) < 0.05) ? 'ambiguous' : 'matched';
    }

    const topicId = (topicStatus !== 'unresolved') ? bestTopic.item.id : null;
    const topicName = bestTopic?.item.name || null;
    const topicKey = bestTopic?.item.key || null;
    const topicScore = bestTopic?.score || 0;

    console.log(`Topic Resolution:`);
    console.log(`  Status: ${topicStatus}`);
    console.log(`  Best Topic: ${topicName} (score: ${topicScore.toFixed(4)})`);
    if (topicStatus === 'ambiguous') {
        console.log(`  Ambiguous with: ${runnerUpTopic?.item.name} (score: ${runnerUpTopic?.score.toFixed(4)})`);
    }

    // 3. Answer Matches
    const answerMatches = allLibraryItems.map(libItem => {
        let score = QuestionnaireMatchingService.cosineSimilarity(vector, libItem.embedding as number[]);
        if (topicId && libItem.topicId === topicId) score += 0.05;
        if (libItem.status === "APPROVED") score += 0.10;
        return { item: libItem, score };
    }).sort((a, b) => b.score - a.score).slice(0, 10);

    console.log(`Candidates Found: ${answerMatches.length}`);
    answerMatches.slice(0, 5).forEach((m, idx) => {
        console.log(`  [${idx}] Score: ${m.score.toFixed(4)} | Status: ${m.item.status} | TopicMatch: ${m.item.topicId === topicId} | WS: ${m.item.workspaceId} | ID: ${m.item.id}`);
    });

    const bestApproved = topicId
        ? answerMatches.find(m => m.item.status === "APPROVED" && m.item.topicId === topicId)
        : undefined;

    console.log(`Best Approved Candidate for Resolved Topic:`);
    if (bestApproved) {
        console.log(`  ID: ${bestApproved.item.id}`);
        console.log(`  Score: ${bestApproved.score.toFixed(4)}`);
        console.log(`  Threshold Pass (0.5): ${bestApproved.score >= 0.5}`);
    } else {
        console.log(`  None found in top-10 warmup matches.`);
    }

    // 4. Sub-control Logic
    const hasSubControlTaxonomy = topicKey ? getSubControls(topicKey).length > 0 : false;
    console.log(`Sub-control Taxonomy: ${hasSubControlTaxonomy ? 'Exists' : 'None'}`);

    let suggestedAnswer = (bestApproved && bestApproved.score >= 0.5) ? bestApproved.item.answer : null;
    let suggestedAnswerId = (bestApproved && bestApproved.score >= 0.5) ? bestApproved.item.id : null;
    let synthesisRan = false;
    let synthesisOutput = "";

    if (topicId && hasSubControlTaxonomy) {
        const topicApproved = allLibraryItems.filter(i => i.status === "APPROVED" && i.topicId === topicId);
        console.log(`  Approved library items for this topic: ${topicApproved.length}`);
        
        const ranked = topicApproved.map(i => ({
            item: i,
            cosine: QuestionnaireMatchingService.cosineSimilarity(vector, i.embedding as number[])
        })).sort((a, b) => b.cosine - a.cosine);

        if (ranked.length > 0) {
            const top = ranked[0];
            const second = ranked[1];
            const hasClearWinner = top.cosine >= 0.75 && (!second || top.cosine - second.cosine >= 0.08);
            console.log(`  Clear Winner Check: topCos=${top.cosine.toFixed(4)}, hasClearWinner=${hasClearWinner}`);
            
            if (!hasClearWinner) {
                const topK = ranked.slice(0, 3).filter(c => c.cosine >= 0.35);
                console.log(`  Synthesis Candidates (topK): ${topK.length}`);
                if (topK.length > 0) {
                    synthesisRan = true;
                    const composed = await AnswerGenerationService.composeFromSubControls({
                        question: item.question,
                        topicName,
                        subControls: topK.map(c => ({
                            subControlKey: c.item.subControlKey ?? null,
                            subControlLabel: c.item.subControlLabels?.[0] ?? null,
                            answer: c.item.answer ?? "",
                            answerId: c.item.id,
                            cosine: c.cosine,
                        })),
                        workspaceId
                    });
                    synthesisOutput = composed.answer;
                    console.log(`  Synthesis Result: len=${synthesisOutput.length}, isLowQuality=${composed.isLowQuality}, reason=${composed.rejectionReason}`);
                    
                    if (!composed.isLowQuality && composed.answer) {
                        suggestedAnswer = composed.answer;
                        suggestedAnswerId = null;
                    } else if (composed.answer) {
                        suggestedAnswer = composed.answer; // Preserve but it will be unresolved
                    }
                }
            } else {
                suggestedAnswer = top.item.answer;
                suggestedAnswerId = top.item.id;
            }
        }
    }

    // 5. Evidence-only Synthesis Path
    if (!suggestedAnswer && topicId && topicScore > 0.6) {
        console.log(`  Triggering Evidence-only Synthesis...`);
        const synth = await AnswerGenerationService.generate(item.question, workspaceId);
        synthesisOutput = synth.answer;
        console.log(`  Synthesis Result: len=${synthesisOutput.length}, isLowQuality=${synth.isLowQuality}, reason=${synth.rejectionReason}`);
        if (!synth.isLowQuality) {
            suggestedAnswer = synth.answer;
        } else if (synth.answer) {
            suggestedAnswer = synth.answer;
        }
    }

    // 6. Fitness Verification
    let fitnessVerdict = null;
    if (suggestedAnswer && topicId) {
        const verdict = await AnswerFitnessService.verify({
            question: item.question,
            answer: suggestedAnswer,
            topicKey,
            answerId: suggestedAnswerId ?? `synthetic:${rowNumber}`,
            workspaceId
        });
        fitnessVerdict = verdict.verdict;
        console.log(`Fitness Verification: ${fitnessVerdict} | Rationale: ${verdict.rationale}`);
        if (fitnessVerdict === "fail") {
            suggestedAnswer = null;
            suggestedAnswerId = null;
        }
    }

    // 6. Retrieval Failure Probe
    let approvedAnswerRetrievalFailed = false;
    let approvedCountForTopic = 0;
    if (topicId && !suggestedAnswer) {
        approvedCountForTopic = await prisma.answerLibraryItem.count({
            where: { workspaceId, topicId, status: "APPROVED" }
        });
        const warmupHasApprovedForTopic = answerMatches.some(m => m.item.status === "APPROVED" && m.item.topicId === topicId);
        if (approvedCountForTopic > 0 && !warmupHasApprovedForTopic) {
            approvedAnswerRetrievalFailed = true;
        }
        console.log(`Retrieval Probe: DB Count=${approvedCountForTopic}, Warmup Has=${warmupHasApprovedForTopic}, Failed=${approvedAnswerRetrievalFailed}`);
    }

    // Final decision mapping (Simplified)
    let finalUnresolvedReason = null;
    if (topicId) {
        if (approvedAnswerRetrievalFailed) finalUnresolvedReason = "approved_answer_retrieval_failed";
        else if (!suggestedAnswer) {
            finalUnresolvedReason = "no_approved_answer";
        }
    }

    console.log(`Final Inspection Results:`);
    console.log(`  Result suggestedAnswer: "${suggestedAnswer ? suggestedAnswer.slice(0, 50) + '...' : ''}" (len: ${suggestedAnswer?.length || 0})`);
    console.log(`  Result suggestedAnswerId: ${suggestedAnswerId}`);
    console.log(`  Result unresolvedReason: ${finalUnresolvedReason}`);

    if ((bestApproved?.score >= 0.75 || synthesisOutput.length > 0) && !suggestedAnswer) {
        console.log(`[DIAGNOSTIC WARNING] Usable answer discarded! SynthesisOutputLen=${synthesisOutput.length}, BestApprovedScore=${bestApproved?.score.toFixed(4)}`);
    }
}

async function main() {
    const workspaceId = "cmoaz5dhg000114qcw0liew33";
    const questionnaireId = "cmob1ca5p01sz14qcocqt3j0p";
    const rowsToInspect = [2, 4, 8, 10, 14, 16];

    console.log(`Starting End-to-End Inspection for Questionnaire: ${questionnaireId}`);

    // Load Warmup Data
    const [allLibraryItems, workspaceTopics, systemTopics, legacyGlobalTopics] = await Promise.all([
        prisma.answerLibraryItem.findMany({
            where: { workspaceId, embedding: { isEmpty: false }, status: { not: "ARCHIVED" } },
            include: { topic: true, _count: { select: { evidence: true } } },
        }),
        prisma.knowledgeTopic.findMany({
            where: { workspaceId, embedding: { isEmpty: false } },
        }),
        prisma.knowledgeTopic.findMany({
            where: { workspaceId: "SYSTEM_WORKSPACE", embedding: { isEmpty: false } },
        }),
        uncheckedPrisma.knowledgeTopic.findMany({
            where: { workspaceId: null, embedding: { isEmpty: false } },
        }),
    ]);
    const allTopics = [...workspaceTopics, ...systemTopics, ...legacyGlobalTopics];

    console.log(`Warmup Stats: Library Items=${allLibraryItems.length}, Total Topics=${allTopics.length}`);

    for (const rowNum of rowsToInspect) {
        await inspectRow(workspaceId, questionnaireId, rowNum, allLibraryItems, allTopics);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
