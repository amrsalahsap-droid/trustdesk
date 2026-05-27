import { ClarificationTask } from "../vendor-intelligence-types";

export interface CanonicalTaskDefinition {
  key: string;
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW" | "CRITICAL";
  suggestedAction: string;
  classification: "blocker" | "enhancement";
  whyItMatters: string;
  whatItUnlocks: string;
}
