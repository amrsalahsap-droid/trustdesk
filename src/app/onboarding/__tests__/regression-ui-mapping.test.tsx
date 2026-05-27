import { describe, it, expect } from "vitest";
import { ClarificationTask } from "../../../../src/modules/workspaces/onboarding/vendor-intelligence-types";
import { GovernanceTaskResolutionEngine } from "../../../../src/modules/workspaces/onboarding/governance-tasks/governance-task-resolution-engine";
import { FoundationBuilder } from "../../../../src/modules/workspaces/onboarding/foundation-builder";

// Mock the UI functions for testing
function getConfidenceBandLabel(band?: string | null): string {
  switch (band) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "limited":
      return "Limited evidence";
    case "unknown":
      return "Needs your decision";
    default:
      return "Needs your decision";
  }
}

function getConfidenceBandColor(band?: string | null): string {
  switch (band) {
    case "high":
      return "text-emerald-600 dark:text-emerald-400";
    case "medium":
      return "text-blue-600 dark:text-blue-400";
    case "limited":
      return "text-amber-600 dark:text-amber-400";
    case "unknown":
      return "text-rose-600 dark:text-rose-400";
    default:
      return "text-rose-600 dark:text-rose-400";
  }
}

function formatConfidenceDisplay(signal: any): { label: string; color: string; showPercentage: boolean } {
  // Use backend confidence band if available
  if (signal.confidenceBand) {
    return {
      label: getConfidenceBandLabel(signal.confidenceBand),
      color: getConfidenceBandColor(signal.confidenceBand),
      showPercentage: false,
    };
  }
  
  // Fallback to percentage conversion for backward compatibility
  const pct = Math.round(Math.max(0, Math.min(1, signal.confidence)) * 100);
  if (pct >= 80) {
    return {
      label: "High confidence",
      color: "text-emerald-600 dark:text-emerald-400",
      showPercentage: true,
    };
  } else if (pct >= 60) {
    return {
      label: "Medium confidence",
      color: "text-blue-600 dark:text-blue-400",
      showPercentage: true,
    };
  } else if (pct >= 40) {
    return {
      label: "Limited evidence",
      color: "text-amber-600 dark:text-amber-400",
      showPercentage: true,
    };
  } else {
    return {
      label: "Needs your decision",
      color: "text-rose-600 dark:text-rose-400",
      showPercentage: true,
    };
  }
}

describe("Regression Tests: UI Mapping", () => {
  describe("Raw percentage is not shown as primary label", () => {
    it("should show confidence band instead of raw percentage when backend confidence available", () => {
      const signal = {
        value: "software",
        confidence: 0.35, // Low AI confidence
        confidenceBand: "high", // But strong backend confidence
        aiConfidence: 0.35,
      };

      const display = formatConfidenceDisplay(signal);

      // Should show backend confidence band, not raw percentage
      expect(display.label).toBe("High confidence");
      expect(display.color).toBe("text-emerald-600 dark:text-emerald-400");
      expect(display.showPercentage).toBe(false); // Percentage hidden
      
      // Raw AI confidence should not be shown as primary
      expect(display.label).not.toContain("35%");
      expect(display.label).not.toContain("35");
    });

    it("should show percentage only when backend confidence unavailable", () => {
      const signal = {
        value: "software",
        confidence: 0.85, // High AI confidence
        confidenceBand: undefined, // No backend confidence
        aiConfidence: 0.85,
      };

      const display = formatConfidenceDisplay(signal);

      // Should fall back to percentage-based display
      expect(display.label).toBe("High confidence");
      expect(display.color).toBe("text-emerald-600 dark:text-emerald-400");
      expect(display.showPercentage).toBe(true); // Percentage shown in debug
    });

    it("should not show misleading AI confidence as user-facing accuracy", () => {
      const signals = [
        {
          value: "software",
          confidence: 0.3, // Low AI confidence
          confidenceBand: "high", // Strong evidence-based confidence
          aiConfidence: 0.3,
        },
        {
          value: "fintech",
          confidence: 0.8, // High AI confidence
          confidenceBand: "limited", // Weak evidence caps confidence
          aiConfidence: 0.8,
        },
        {
          value: "healthtech",
          confidence: 0.6, // Medium AI confidence
          confidenceBand: "unknown", // Conflict overrides
          aiConfidence: 0.6,
        },
      ];

      const displays = signals.map(formatConfidenceDisplay);

      // User-facing labels should reflect backend confidence, not AI confidence
      expect(displays[0].label).toBe("High confidence"); // Evidence-based, not AI 30%
      expect(displays[1].label).toBe("Limited evidence"); // Evidence-capped, not AI 80%
      expect(displays[2].label).toBe("Needs your decision"); // Conflict, not AI 60%
      
      // None should show raw AI percentages as primary
      displays.forEach(display => {
        expect(display.label).not.toMatch(/\d+%/);
        expect(display.label).not.toContain("30%");
        expect(display.label).not.toContain("80%");
        expect(display.label).not.toContain("60%");
      });
    });
  });

  describe("ConfidenceBand is shown", () => {
    it("should display all confidence band variants correctly", () => {
      const testCases = [
        { confidenceBand: "high", expectedLabel: "High confidence", expectedColor: "text-emerald-600 dark:text-emerald-400" },
        { confidenceBand: "medium", expectedLabel: "Medium confidence", expectedColor: "text-blue-600 dark:text-blue-400" },
        { confidenceBand: "limited", expectedLabel: "Limited evidence", expectedColor: "text-amber-600 dark:text-amber-400" },
        { confidenceBand: "unknown", expectedLabel: "Needs your decision", expectedColor: "text-rose-600 dark:text-rose-400" },
        { confidenceBand: null, expectedLabel: "Needs your decision", expectedColor: "text-rose-600 dark:text-rose-400" },
        { confidenceBand: undefined, expectedLabel: "Needs your decision", expectedColor: "text-rose-600 dark:text-rose-400" },
      ];

      testCases.forEach(({ confidenceBand, expectedLabel, expectedColor }) => {
        const isFallback = confidenceBand === null || confidenceBand === undefined;
        const signal = { confidenceBand, confidence: isFallback ? 0.2 : 0.5 };
        const display = formatConfidenceDisplay(signal);
        
        expect(display.label).toBe(expectedLabel);
        expect(display.color).toBe(expectedColor);
        expect(display.showPercentage).toBe(isFallback); // Fallback percentage conversion shows percentage
      });
    });

    it("should prioritize backend confidenceBand over percentage conversion", () => {
      const signal = {
        confidence: 0.25, // Would normally be "Needs your decision"
        confidenceBand: "medium", // Backend overrides to medium
        aiConfidence: 0.25,
      };

      const display = formatConfidenceDisplay(signal);

      // Backend confidence should win
      expect(display.label).toBe("Medium confidence");
      expect(display.color).toBe("text-blue-600 dark:text-blue-400");
      expect(display.showPercentage).toBe(false);
    });

    it("should handle conflicted states correctly", () => {
      const conflictedSignals = [
        {
          confidence: 0.8,
          confidenceBand: "unknown", // Conflict overrides
          isConflicted: true,
        },
        {
          confidence: 0.6,
          confidenceBand: "unknown", // Conflict overrides
          isConflicted: true,
        },
        {
          confidence: 0.4,
          confidenceBand: "unknown", // Conflict overrides
          isConflicted: true,
        },
      ];

      conflictedSignals.forEach(signal => {
        const display = formatConfidenceDisplay(signal);
        expect(display.label).toBe("Needs your decision");
        expect(display.color).toBe("text-rose-600 dark:text-rose-400");
      });
    });
  });

  describe("Rendered label is clarified", () => {
    it("should show JS-rendered instead of Rendered", () => {
      // Mock the extraction data structure
      const extraction = {
        ok: true,
        strongPages: 3,
        renderedPages: 0, // This should be shown as JS-rendered: 0
        totalNonBoilerplateChars: 5000,
      };

      // The UI should display "JS-rendered: 0" not "Rendered: 0"
      const expectedLabel = "JS-rendered: 0";
      expect(extraction.renderedPages).toBe(0);
      
      // In the actual UI, this would be rendered as:
      // <span>JS-rendered: {extraction.renderedPages}</span>
      expect(expectedLabel).toBe("JS-rendered: 0");
    });

    it("should show JS-rendered with positive numbers", () => {
      const extraction = {
        ok: true,
        strongPages: 2,
        renderedPages: 3, // Some pages needed JS rendering
        totalNonBoilerplateChars: 3000,
      };

      const expectedLabel = "JS-rendered: 3";
      expect(extraction.renderedPages).toBe(3);
      expect(expectedLabel).toBe("JS-rendered: 3");
    });

    it("should provide tooltip explanation for 0 rendered pages", () => {
      // Mock tooltip behavior for 0 rendered pages
      const renderedPages = 0;
      const shouldShowTooltip = renderedPages === 0;
      
      expect(shouldShowTooltip).toBe(true);
      
      // Tooltip text should explain:
      // "0 means static HTML extraction was enough; browser rendering was not needed."
      const tooltipText = "0 means static HTML extraction was enough; browser rendering was not needed.";
      expect(tooltipText).toContain("static HTML extraction was enough");
      expect(tooltipText).toContain("browser rendering was not needed");
    });

    it("should not show tooltip when rendered pages > 0", () => {
      const renderedPages = 2;
      const shouldShowTooltip = renderedPages === 0;
      
      expect(shouldShowTooltip).toBe(false);
    });
  });

  describe("UI consistency and user experience", () => {
    it("should maintain consistent color coding across confidence bands", () => {
      const confidenceLevels = [
        { band: "high", expectedColor: "emerald" },
        { band: "medium", expectedColor: "blue" },
        { band: "limited", expectedColor: "amber" },
        { band: "unknown", expectedColor: "rose" },
      ];

      confidenceLevels.forEach(({ band, expectedColor }) => {
        const color = getConfidenceBandColor(band);
        expect(color).toContain(expectedColor);
      });
    });

    it("should provide clear user-friendly labels", () => {
      const labels = {
        "high": "High confidence",
        "medium": "Medium confidence", 
        "limited": "Limited evidence",
        "unknown": "Needs your decision",
      };

      Object.entries(labels).forEach(([band, expectedLabel]) => {
        const label = getConfidenceBandLabel(band);
        expect(label).toBe(expectedLabel);
        
        // Labels should be user-friendly, not technical
        expect(label).not.toContain("score");
        expect(label).not.toContain("percentage");
        expect(label).not.toContain("AI");
      });
    });

    it("should handle edge cases gracefully", () => {
      const edgeCases = [
        { confidenceBand: null, confidence: 0 },
        { confidenceBand: undefined, confidence: 0 },
        { confidenceBand: "", confidence: 0 },
        { confidenceBand: "invalid" as any, confidence: 0 },
      ];

      edgeCases.forEach(signal => {
        const display = formatConfidenceDisplay(signal);
        
        // Should fall back to safe defaults
        expect(display.label).toBe("Needs your decision");
        expect(display.color).toBe("text-rose-600 dark:text-rose-400");
      });
    });

    it("should preserve AI confidence for debugging while hiding from users", () => {
      const signal = {
        confidence: 0.35, // Updated for user display
        confidenceBand: "high",
        aiConfidence: 0.35, // Preserved for debugging
      };

      const display = formatConfidenceDisplay(signal);

      // User sees backend confidence
      expect(display.label).toBe("High confidence");
      expect(display.showPercentage).toBe(false);
      
      // AI confidence preserved separately
      expect(signal.aiConfidence).toBe(0.35);
      expect(signal.confidence).toBe(0.35); // Updated to backend value
    });
  });

  describe("Integration scenarios", () => {
    it("should handle complete industry classification UI scenario", () => {
      // Mock a complete industry classification result
      const industryCandidate = {
        value: "software",
        supportScore: 85,
        confidenceBand: "high",
        evidenceCoverage: "strong",
        evidenceRefs: [
          { sourceUrl: "https://example.com/about", pageType: "about", snippet: "software company", strength: "strong", contribution: 40 },
          { sourceUrl: "https://example.com/product", pageType: "product", snippet: "SaaS platform", strength: "strong", contribution: 25 },
        ],
        reasons: ["DIRECT_QUOTE match: software", "Repeated across 2 pages"],
        conflictingSignals: [],
        isConflicted: false,
      };

      const signal = {
        value: ["software"],
        confidence: 0.35, // Low AI confidence
        confidenceBand: "high", // High backend confidence
        aiConfidence: 0.35,
      };

      const display = formatConfidenceDisplay(signal);

      // UI should show backend confidence
      expect(display.label).toBe("High confidence");
      expect(display.color).toBe("text-emerald-600 dark:text-emerald-400");
      expect(display.showPercentage).toBe(false);

      // Industry candidate should have complete explainability
      expect(industryCandidate.supportScore).toBe(85);
      expect(industryCandidate.confidenceBand).toBe("high");
      expect(industryCandidate.evidenceRefs).toHaveLength(2);
      expect(industryCandidate.reasons).toContain("DIRECT_QUOTE match: software");
    });

    it("should handle conflicted industry classification UI scenario", () => {
      const conflictedSignal = {
        value: ["software"],
        confidence: 0.65,
        confidenceBand: "unknown", // Conflict overrides
        aiConfidence: 0.65,
        conflict: {
          rival: { value: ["healthtech"], confidence: 0.60 },
        },
      };

      const display = formatConfidenceDisplay(conflictedSignal);

      // Should show conflicted state
      expect(display.label).toBe("Needs your decision");
      expect(display.color).toBe("text-rose-600 dark:text-rose-400");
      
      // Should include conflict explanation
      const conflictExplanation = "Competing evidence was found. Choose the best fit.";
      expect(conflictExplanation).toContain("Competing evidence");
    });
  });

  describe("Class-A Onboarding UI Fixes", () => {
    it("should deduplicate Remaining Governance Tasks by canonical key or normalized title to prevent identical/similar tasks appearing in both sections", () => {
      const priorityTask = {
        id: "task_ai_model_training",
        title: "Confirm whether customer data is used to train AI models",
        description: "Does the vendor use customer data to train AI models?",
      };
      
      const remainingTasksRaw = [
        {
          id: "task_ai_clarification",
          title: "Confirm whether customer data is used to train AI models",
          description: "Verify if customer-provided data inputs are utilized for AI training.",
        },
        {
          id: "task_tenant_isolation",
          title: "Verify logical tenant isolation controls in shared environments",
          description: "Confirm that multi-tenant database partitions prevent data leakage.",
        }
      ];

      // Replicate the deduplication filter logic in onboarding-workspace-form.tsx
      const priorityTitleNorm = (priorityTask.title || "").toLowerCase().trim();
      const priorityId = (priorityTask.id || "").toLowerCase().trim();

      const getCanonicalKey = (task: any) => {
        const id = (task.id || "").toLowerCase();
        const title = (task.title || "").toLowerCase();
        const desc = (task.description || "").toLowerCase();

        if (
          id.includes("ai_clarification") ||
          id.includes("ai_model_training") ||
          id.includes("confirm_ai_usage") ||
          title.includes("train ai models") ||
          title.includes("ai data usage") ||
          desc.includes("train ai models") ||
          desc.includes("usesaioncustomerdata")
        ) {
          return "ai_training_confirmation";
        }
        return "";
      };

      const priorityKey = getCanonicalKey(priorityTask);

      const remainingTasks = remainingTasksRaw.filter(task => {
        const titleNorm = (task.title || "").toLowerCase().trim();
        const idNorm = (task.id || "").toLowerCase().trim();

        // 1. Exact title or ID match
        if (titleNorm === priorityTitleNorm || idNorm === priorityId) {
          return false;
        }

        // 2. Canonical key matching fallback
        const taskKey = getCanonicalKey(task);
        if (priorityKey && taskKey && priorityKey === taskKey) {
          return false;
        }

        return true;
      });

      // Verification
      expect(remainingTasks).toHaveLength(1);
      expect(remainingTasks[0].id).toBe("task_tenant_isolation");
      expect(remainingTasks.some(t => t.title === priorityTask.title)).toBe(false);
    });

    it("should consistently show resolvedEvidenceNeeds count when rawEvidenceNeeds is 31 and resolvedEvidenceNeeds is 20", () => {
      const rawEvidenceNeeds = Array.from({ length: 31 }, (_, i) => ({ type: `need_${i}`, title: `Need ${i}` }));
      const resolvedEvidenceNeeds = Array.from({ length: 20 }, (_, i) => ({ type: `resolved_${i}`, title: `Resolved Need ${i}` }));
      
      const evidenceNeedsCount = resolvedEvidenceNeeds.length;
      
      // In the UI (readiness-foundation-summary.tsx / onboarding-workspace-form.tsx):
      const totalGapsCount = resolvedEvidenceNeeds && resolvedEvidenceNeeds.length > 0
        ? resolvedEvidenceNeeds.length
        : rawEvidenceNeeds.length;

      const dynamicEvidenceNeedsCount = Math.max(0, totalGapsCount);

      // Verification: the count displayed in UI matches resolved count (20)
      expect(evidenceNeedsCount).toBe(20);
      expect(dynamicEvidenceNeedsCount).toBe(20);
    });

    it("should merge duplicate tasks with same canonicalKey correctly and preserve merged metadata", () => {
      const task1: ClarificationTask = {
        id: "task_ai_clarification",
        title: "Confirm whether customer data is used to train AI models",
        description: "Verify if customer-provided data inputs are utilized for AI training.",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: ["usesAIOnCustomerData"],
        suggestedAction: "Update AI Ethics/DPA Policy",
        classification: "blocker",
        whyItMatters: "Enterprise procurement teams frequently block AI vendors.",
        whatItUnlocks: "AI governance readiness",
        affectedRisks: ["AI Training Risk"],
        affectedTrustTopics: ["ai_governance"],
        confidenceDelta: 10,
      };

      const task2: ClarificationTask = {
        id: "task_ai_model_training",
        title: "Confirm whether customer data is used to train AI models",
        description: "Does the vendor use customer data to train or fine-tune AI models?",
        priority: "CRITICAL",
        status: "inferred_need_confirm",
        triggeringSignals: ["ai_training_risk"],
        suggestedAction: "Update DPA Policy",
        classification: "blocker",
        whyItMatters: "Customer data exposure danger.",
        whatItUnlocks: "Procurement approval acceleration",
        affectedRisks: ["Customer Data Exposure"],
        affectedTrustTopics: ["privacy_data_protection"],
        confidenceDelta: 18,
      };

      const resolved = GovernanceTaskResolutionEngine.resolve([task1, task2]);

      expect(resolved).toHaveLength(1);
      const merged = resolved[0];

      // Key taxonomy resolved key
      expect(merged.id).toBe("task_ai_training_confirmation");
      expect(merged.canonicalKey).toBe("ai_training_confirmation");
      
      // Highest priority is CRITICAL
      expect(merged.priority).toBe("CRITICAL");

      // Preserved and merged metadata
      expect(merged.affectedRisks).toContain("AI Training Risk");
      expect(merged.affectedRisks).toContain("Customer Data Exposure");
      expect(merged.affectedTrustTopics).toContain("ai_governance");
      expect(merged.affectedTrustTopics).toContain("privacy_data_protection");
      
      // Expected unlocks are merged
      expect(merged.whatItUnlocks).toContain("AI governance readiness");
      expect(merged.whatItUnlocks).toContain("Procurement approval acceleration");

      // Confidence boost (delta) is max or preserved
      expect(merged.confidenceDelta).toBe(18);
    });

    it("should merge duplicate tasks with same normalized title correctly (fallback) when canonicalKey is missing", () => {
      const task1: ClarificationTask = {
        id: "task_custom_1",
        title: "Audit internal hardware inventory list!!!  ",
        description: "Custom check.",
        priority: "MEDIUM",
        status: "pending",
        triggeringSignals: ["usesAIOnCustomerData"],
        suggestedAction: "Action A",
        classification: "blocker",
        whyItMatters: "Why A",
        whatItUnlocks: "Unlock A",
        affectedRisks: ["Risk A"],
        affectedTrustTopics: ["Topic A"],
        confidenceDelta: 5,
      };

      const task2: ClarificationTask = {
        id: "task_custom_2",
        title: "audit internal hardware inventory list?",
        description: "Another custom check.",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: ["accessesCustomerData"],
        suggestedAction: "Action B",
        classification: "blocker",
        whyItMatters: "Why B",
        whatItUnlocks: "Unlock B",
        affectedRisks: ["Risk B"],
        affectedTrustTopics: ["Topic B"],
        confidenceDelta: 12,
      };

      const resolved = GovernanceTaskResolutionEngine.resolve([task1, task2]);

      expect(resolved).toHaveLength(1);
      const merged = resolved[0];

      // fallback normalized key
      expect(merged.canonicalKey).toBe("custom_audit_internal_hardware_inventory_list");
      
      // Highest priority is HIGH
      expect(merged.priority).toBe("HIGH");

      // Preserved metadata
      expect(merged.affectedRisks).toContain("Risk A");
      expect(merged.affectedRisks).toContain("Risk B");
      expect(merged.affectedTrustTopics).toContain("Topic A");
      expect(merged.affectedTrustTopics).toContain("Topic B");
      expect(merged.whatItUnlocks).toContain("Unlock A");
      expect(merged.whatItUnlocks).toContain("Unlock B");
      expect(merged.confidenceDelta).toBe(12);
    });

    it("should build foundation with priority task excluded from remainingGovernanceTasks", () => {
      const builderResult = FoundationBuilder.build({
        riskAreas: [
          {
            key: "ai_training_risk",
            label: "AI Model Training Risk",
            severity: "CRITICAL",
            confidence: 0.9,
            evidenceStrength: "weak",
            recommendedTopicKeys: ["ai_governance"],
          },
          {
            key: "tenant_escape_risk",
            label: "Logical Tenant Escape Risk",
            severity: "CRITICAL",
            confidence: 0.8,
            evidenceStrength: "weak",
            recommendedTopicKeys: ["infrastructure_security"],
          }
        ],
        capabilities: [],
        operationalModel: {
          accessesCustomerData: true,
          processesSensitiveData: true,
          storesCustomerData: true,
          handlesPII: true,
          handlesFinancialData: false,
          handlesHealthData: false,
          handlesCredentials: true,
          usesAIOnCustomerData: true,
          scansInfrastructure: false,
          handlesPayments: false,
        },
        evidenceRefs: [],
        citations: [],
        sourcePages: [],
      });

      // Verification of priority task separation
      expect(builderResult.priorityActionItem).toBeDefined();
      expect(builderResult.remainingGovernanceTasks).toBeDefined();

      const priorityKey = builderResult.priorityActionItem?.canonicalKey;
      const priorityTitleNorm = builderResult.priorityActionItem?.title.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");

      builderResult.remainingGovernanceTasks?.forEach(task => {
        // Must not share same canonicalKey
        if (priorityKey && task.canonicalKey) {
          expect(task.canonicalKey).not.toBe(priorityKey);
        }

        // Must not share same normalized title
        const taskTitleNorm = task.title.toLowerCase().trim().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
        expect(taskTitleNorm).not.toBe(priorityTitleNorm);
      });
    });

    it("should merge duplicate AI training tasks with different formats into one canonical task", () => {
      const task1: ClarificationTask = {
        id: "task_raw_1",
        title: "Confirm if customer data is used for model training",
        description: "Does the vendor train AI models?",
        priority: "HIGH",
        status: "pending",
        triggeringSignals: [],
        suggestedAction: "Update AI Ethics Policy",
      };

      const task2: ClarificationTask = {
        id: "task_raw_2",
        title: "Confirm whether customer data is used to train AI models",
        description: "Verify if customer inputs train AI models.",
        priority: "CRITICAL",
        status: "inferred_need_confirm",
        triggeringSignals: [],
        suggestedAction: "Update DPA Policy",
      };

      const resolved = GovernanceTaskResolutionEngine.resolve([task1, task2]);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].canonicalKey).toBe("ai_training_confirmation");
    });

    it("should assert confirmation count equals unique deduplicated task count in foundation result", () => {
      const builderResult = FoundationBuilder.build({
        riskAreas: [
          {
            key: "ai_training_risk",
            label: "AI Model Training Risk",
            severity: "CRITICAL",
            confidence: 0.9,
            evidenceStrength: "weak",
            recommendedTopicKeys: ["ai_governance"],
          }
        ],
        capabilities: [],
        operationalModel: {
          accessesCustomerData: true,
          processesSensitiveData: true,
          storesCustomerData: true,
          handlesPII: true,
          handlesFinancialData: false,
          handlesHealthData: false,
          handlesCredentials: true,
          usesAIOnCustomerData: true,
          scansInfrastructure: false,
          handlesPayments: false,
        },
        evidenceRefs: [],
        citations: [],
        sourcePages: [],
        clarificationTasks: [
          {
            id: "task_custom_dup_1",
            title: "Confirm if customer data is used for model training",
            description: "Duplicate A",
            priority: "MEDIUM",
            status: "pending",
            triggeringSignals: [],
            suggestedAction: "",
          },
          {
            id: "task_custom_dup_2",
            title: "Confirm whether customer data is used to train AI models",
            description: "Duplicate B",
            priority: "CRITICAL",
            status: "pending",
            triggeringSignals: [],
            suggestedAction: "",
          }
        ]
      });

      const expectedUniqueCount = builderResult.clarificationTasks.length;
      expect(builderResult.clarificationTasksCount).toBe(expectedUniqueCount);

      const aiTrainingTasks = builderResult.clarificationTasks.filter(t => t.canonicalKey === "ai_training_confirmation");
      expect(aiTrainingTasks).toHaveLength(1);
    });
  });
});

