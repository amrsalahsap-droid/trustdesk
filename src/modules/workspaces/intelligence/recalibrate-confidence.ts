async function recalibrateConfidence() {
  console.log("--- Confidence Model Recalibration Diagnostic ---");

  const WEIGHTS = {
    TOPIC_SIMILARITY: 0.30,
    ANSWER_SIMILARITY: 0.20,
    SOURCE_TRUST: 0.15,
    EVIDENCE_BONUS: 0.20,
    VERIFIER_BONUS: 0.15,
  };

  const THRESHOLDS = {
    HIGH: 0.70,
    MEDIUM: 0.40
  };

  function calculateScore(scenario: string, inputs: {
    topicScore: number,
    answerScore: number,
    isSynthetic: boolean,
    hasSubControlTrust: boolean,
    evidenceCount: number,
    verifierPass: boolean
  }) {
    const S_topic = Math.max(0, Math.min(1.0, inputs.topicScore));
    const S_answer = Math.max(0, Math.min(1.0, inputs.answerScore));
    
    // B_trust logic from service:
    // (suggestedAnswerId != null && !isSynthetic) || (isSynthetic && (sourceAnswerIds.length > 0 || sourceSubControlKeys.length > 0))
    const B_trust = inputs.hasSubControlTrust ? 1.0 : 0.0;
    
    const B_evid = inputs.evidenceCount > 0 ? 1.0 : 0.0;
    const B_verif = inputs.verifierPass ? 1.0 : 0.0;

    const compoundScore = (S_topic * WEIGHTS.TOPIC_SIMILARITY) + 
                          (S_answer * WEIGHTS.ANSWER_SIMILARITY) + 
                          (B_trust * WEIGHTS.SOURCE_TRUST) + 
                          (B_evid * WEIGHTS.EVIDENCE_BONUS) + 
                          (B_verif * WEIGHTS.VERIFIER_BONUS);

    let band: "high" | "medium" | "low" = "low";
    if (compoundScore >= THRESHOLDS.HIGH) band = "high";
    else if (compoundScore >= THRESHOLDS.MEDIUM) band = "medium";

    console.log(`\nScenario: ${scenario}`);
    console.log(` - Inputs: T:${inputs.topicScore.toFixed(2)}, A:${inputs.answerScore.toFixed(2)}, Synth:${inputs.isSynthetic}, Trust:${inputs.hasSubControlTrust}, Evid:${inputs.evidenceCount}, Verif:${inputs.verifierPass}`);
    console.log(` - Breakdown: [T:${(S_topic * WEIGHTS.TOPIC_SIMILARITY).toFixed(2)}, A:${(S_answer * WEIGHTS.ANSWER_SIMILARITY).toFixed(2)}, Trust:${(B_trust * WEIGHTS.SOURCE_TRUST).toFixed(2)}, Evid:${(B_evid * WEIGHTS.EVIDENCE_BONUS).toFixed(2)}, Verif:${(B_verif * WEIGHTS.VERIFIER_BONUS).toFixed(2)}]`);
    console.log(` - TOTAL: ${compoundScore.toFixed(2)} -> Band: ${band.toUpperCase()}`);
    
    return compoundScore;
  }

  // 1. Strong Approved Match
  calculateScore("Strong Approved Match", {
    topicScore: 0.9,
    answerScore: 0.9,
    isSynthetic: false,
    hasSubControlTrust: true,
    evidenceCount: 3,
    verifierPass: true
  });

  // 2. Strong Sub-control Synthesis
  calculateScore("Strong Sub-control Synthesis", {
    topicScore: 0.8,
    answerScore: 0.6, // Synthesized answers often have lower direct answer similarity to the question
    isSynthetic: true,
    hasSubControlTrust: true,
    evidenceCount: 3,
    verifierPass: true
  });

  // 3. Strong Evidence Synthesis (No Library)
  calculateScore("Strong Evidence Synthesis", {
    topicScore: 0.7,
    answerScore: 0.0, // No library match
    isSynthetic: true,
    hasSubControlTrust: false,
    evidenceCount: 5,
    verifierPass: true
  });

  // 4. Borderline Evidence Synthesis
  calculateScore("Borderline Evidence Synthesis", {
    topicScore: 0.5,
    answerScore: 0.0,
    isSynthetic: true,
    hasSubControlTrust: false,
    evidenceCount: 2,
    verifierPass: true
  });
}

recalibrateConfidence();
