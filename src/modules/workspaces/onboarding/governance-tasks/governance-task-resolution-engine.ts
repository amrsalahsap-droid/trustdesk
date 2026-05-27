import { ClarificationTask } from "../vendor-intelligence-types";
import { GOVERNANCE_TASK_TAXONOMY } from "./governance-task-taxonomy";

export class GovernanceTaskResolutionEngine {
  
  private static PRIORITY_ORDER = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  /**
   * Helper function to normalize titles for fallback comparison and key generation.
   * - lowercase
   * - trim
   * - remove punctuation
   * - collapse whitespace
   */
  static normalizeTitle(title: string): string {
    return (title || "")
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "") // remove punctuation
      .replace(/\s+/g, " "); // collapse whitespace
  }

  /**
   * Identifies the canonical key for a given task.
   */
  static matchToCanonicalKey(task: ClarificationTask): string {
    const id = (task.id || "").toLowerCase();
    const title = (task.title || "").toLowerCase();
    const desc = (task.description || "").toLowerCase();

    if (
      id.includes("ai_clarification") ||
      id.includes("ai_model_training") ||
      id.includes("confirm_ai_usage") ||
      title.includes("train ai models") ||
      title.includes("ai data usage") ||
      title.includes("model training") ||
      title.includes("ai model") ||
      title.includes("uses customer data to train") ||
      desc.includes("train ai models") ||
      desc.includes("usesaioncustomerdata") ||
      desc.includes("model training")
    ) {
      return "ai_training_confirmation";
    }

    if (
      id.includes("data_access_clarification") ||
      id.includes("support_staff_access") ||
      id.includes("confirm_support_impersonation") ||
      title.includes("support personnel") ||
      title.includes("support staff") ||
      title.includes("support impersonation") ||
      title.includes("database access controls") ||
      desc.includes("support personnel") ||
      desc.includes("support staff") ||
      desc.includes("support impersonation")
    ) {
      return "support_access_confirmation";
    }

    if (
      id.includes("tenant_isolation") ||
      title.includes("tenant isolation") ||
      title.includes("tenant escape") ||
      desc.includes("tenant isolation") ||
      desc.includes("tenant escape")
    ) {
      return "tenant_isolation_confirmation";
    }

    if (
      id.includes("confirm_connector_perms") ||
      title.includes("connector permission") ||
      title.includes("cloud connector") ||
      desc.includes("cloud connector") ||
      desc.includes("connector perms")
    ) {
      return "connector_permission_confirmation";
    }

    if (
      id.includes("data_retention") ||
      id.includes("storage_residency") ||
      title.includes("retention") ||
      title.includes("data deletion") ||
      desc.includes("retention") ||
      desc.includes("data deletion") ||
      desc.includes("storescustomerdata")
    ) {
      return "data_retention_confirmation";
    }

    if (
      id.includes("privileged_access") ||
      title.includes("privileged access") ||
      title.includes("privileged and administrative") ||
      desc.includes("privileged access")
    ) {
      return "privileged_access_confirmation";
    }

    if (
      id.includes("subprocessor") ||
      id.includes("supply_chain") ||
      title.includes("subprocessor") ||
      title.includes("supply chain") ||
      desc.includes("subprocessor") ||
      desc.includes("supply chain")
    ) {
      return "subprocessor_confirmation";
    }

    // Fallback: Deduplicate by normalized title if canonical key is missing
    const normTitle = this.normalizeTitle(task.title);
    if (normTitle) {
      return `custom_${normTitle.replace(/\s+/g, "_")}`;
    }

    // Default to the task's own ID as a fallback canonical key so it is preserved
    return id;
  }

  /**
   * Resolves and merges a list of tasks into a deduplicated list of canonical tasks.
   */
  static resolve(tasks: ClarificationTask[]): ClarificationTask[] {
    if (!tasks || tasks.length === 0) return [];

    const grouped = new Map<string, ClarificationTask[]>();

    tasks.forEach(task => {
      const key = this.matchToCanonicalKey(task);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(task);
    });

    const resolvedTasks: ClarificationTask[] = [];

    grouped.forEach((incomingTasks, key) => {
      const taxonomyDef = GOVERNANCE_TASK_TAXONOMY[key];

      // Base properties from the taxonomy if found, else from the first task
      const baseTask = incomingTasks[0];
      const mergedTitle = taxonomyDef ? taxonomyDef.title : baseTask.title;
      const mergedDescription = taxonomyDef ? taxonomyDef.description : baseTask.description;
      const mergedSuggestedAction = taxonomyDef ? taxonomyDef.suggestedAction : baseTask.suggestedAction;
      const mergedClassification = taxonomyDef ? taxonomyDef.classification : (baseTask.classification || "enhancement");
      const mergedWhyItMatters = taxonomyDef ? taxonomyDef.whyItMatters : (baseTask.whyItMatters || "");
      const mergedWhatItUnlocks = taxonomyDef ? taxonomyDef.whatItUnlocks : (baseTask.whatItUnlocks || "");

      // 1. Highest priority
      let maxPriorityVal = 0;
      let mergedPriority = baseTask.priority || "MEDIUM";
      
      incomingTasks.forEach(t => {
        const val = this.PRIORITY_ORDER[t.priority] || 0;
        if (val > maxPriorityVal) {
          maxPriorityVal = val;
          mergedPriority = t.priority;
        }
      });

      // 2. Highest confidence delta
      let mergedConfidenceDelta = 0;
      incomingTasks.forEach(t => {
        if (t.confidenceDelta !== undefined) {
          mergedConfidenceDelta = Math.max(mergedConfidenceDelta, t.confidenceDelta);
        }
      });

      // 3. Deduplicate triggering signals
      const mergedTriggeringSignals = Array.from(
        new Set(incomingTasks.flatMap(t => t.triggeringSignals || []))
      );

      // 4. Deduplicate affected risks
      const mergedAffectedRisks = Array.from(
        new Set(incomingTasks.flatMap(t => t.affectedRisks || []))
      );

      // 5. Deduplicate affected trust topics
      const mergedAffectedTrustTopics = Array.from(
        new Set(incomingTasks.flatMap(t => t.affectedTrustTopics || []))
      );

      // 6. Merge status (if any is resolved, let's keep resolved, else pending)
      let mergedStatus: ClarificationTask["status"] = "pending";
      if (incomingTasks.some(t => t.status === "resolved")) {
        mergedStatus = "resolved";
      } else if (incomingTasks.some(t => t.status === "inferred_need_confirm")) {
        mergedStatus = "inferred_need_confirm";
      }

      // 7. Consolidation of whyItMatters, whatItUnlocks, and suggestedAction to be rich and clear
      const consolidatedWhyItMatters = Array.from(
        new Set([
          mergedWhyItMatters,
          ...incomingTasks.map(t => t.whyItMatters)
        ].filter(Boolean))
      ).join(" ");

      const consolidatedWhatItUnlocks = Array.from(
        new Set([
          mergedWhatItUnlocks,
          ...incomingTasks.map(t => t.whatItUnlocks)
        ].filter(Boolean))
      ).join(" ");

      const consolidatedSuggestedAction = Array.from(
        new Set([
          mergedSuggestedAction,
          ...incomingTasks.map(t => t.suggestedAction)
        ].filter(Boolean))
      ).join(" ");

      resolvedTasks.push({
        id: taxonomyDef ? `task_${key}` : baseTask.id,
        canonicalKey: key,
        title: mergedTitle,
        description: mergedDescription,
        priority: mergedPriority,
        status: mergedStatus,
        triggeringSignals: mergedTriggeringSignals,
        suggestedAction: consolidatedSuggestedAction,
        classification: mergedClassification,
        whyItMatters: consolidatedWhyItMatters,
        whatItUnlocks: consolidatedWhatItUnlocks,
        affectedRisks: mergedAffectedRisks,
        affectedTrustTopics: mergedAffectedTrustTopics,
        confidenceDelta: mergedConfidenceDelta > 0 ? mergedConfidenceDelta : undefined,
        smartDefault: baseTask.smartDefault || (taxonomyDef ? `No, we do not train on customer data or violate these restrictions.` : undefined),
        impactPriority: mergedPriority === "CRITICAL" || mergedPriority === "HIGH" ? "high" : "medium",
        
        // Deduplication metadata V2 mapping
        normalizedTitle: this.normalizeTitle(mergedTitle),
        relatedRisks: mergedAffectedRisks,
        relatedPillars: mergedAffectedTrustTopics,
        requestedEvidence: consolidatedSuggestedAction,
        expectedUnlock: consolidatedWhatItUnlocks,
        confidenceBoost: mergedConfidenceDelta > 0 ? mergedConfidenceDelta : undefined
      });
    });

    // Sort priority and blocker status so UI displays blockers and critical items first
    return resolvedTasks.sort((a, b) => {
      if (a.classification === "blocker" && b.classification !== "blocker") return -1;
      if (a.classification !== "blocker" && b.classification === "blocker") return 1;

      const weightA = this.PRIORITY_ORDER[a.priority] || 0;
      const weightB = this.PRIORITY_ORDER[b.priority] || 0;
      if (weightB !== weightA) return weightB - weightA;

      return (b.confidenceDelta || 0) - (a.confidenceDelta || 0);
    });
  }
}
