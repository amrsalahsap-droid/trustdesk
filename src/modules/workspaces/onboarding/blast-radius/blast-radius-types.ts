export type BlastRadiusProfile = {
  customerDataExposureLevel: number; // 1 to 5
  infrastructureReachLevel: number; // 1 to 5
  actionExecutionRisk: number; // 1 to 5
  identityExposureLevel: number; // 1 to 5
  operationalDependencyLevel: number; // 1 to 5
  compromiseScenarios: CompromiseScenario[];
};

export type CompromiseScenario = {
  key: string;
  name: string;
  probability: "low" | "medium" | "high";
  impact: "low" | "medium" | "high" | "critical";
  description: string;
  compromiseVector: string;
  businessImpact: string;
  inferredFrom: string[];
  suggestedMitigations: string[];
};
