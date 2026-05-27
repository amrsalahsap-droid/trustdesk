import { type Prisma } from "@prisma/client";
import { type SignalCitation } from "./onboarding/evidence";
import {
  type DeepInferredProfile,
  type Signal,
  type SignalCategory,
  type SignalCandidate,
  type SignalConflict,
  type Capability,
  type ProcurementRiskArea,
  type DataInteractionModel,
} from "./onboarding/website-analysis-service";
import { type TailoredProfile, type TailoringMode } from "./onboarding/tailoring-engine";

export type ProfileFieldSource = "user-confirmed" | "ai-inferred" | "default";

export type ProfileField<T> = {
  value: T;
  source: ProfileFieldSource;
  /** 1.0 user-confirmed; Signal.confidence for AI; 0 for default */
  confidence: number;
  category?: SignalCategory;
  /** Original Signal.source when AI-inferred */
  inferenceSource?: string;
  citations?: SignalCitation[];
  candidates?: SignalCandidate<T>[];
  conflict?: SignalConflict<T>;
};

export type CompanyProfile = {
  workspaceId: string;
  companyName: string;
  industry: ProfileField<string[]>;
  productType: ProfileField<string[]>;
  customerSegment: ProfileField<string[]>;
  dataTypes: ProfileField<string[]>;
  complianceSignals: ProfileField<string[]>; // Deprecated
  namedComplianceFrameworks: ProfileField<string[]>; // Deprecated
  vendorCertifications: ProfileField<string[]>;
  productSupportedFrameworks: ProfileField<string[]>;
  privacyPostureSignals: ProfileField<string[]>;
  userTypes: ProfileField<string[]>;
  internalRoles: ProfileField<string[]>;
  operationalWorkflows: ProfileField<string[]>;
  trustClaims: ProfileField<string[]>;
  riskAreas: ProfileField<string[]>;
  businessDomain: ProfileField<string>;
  solutionCategories: ProfileField<string[]>;
  productLines: ProfileField<string[]>;
  useCases: ProfileField<string[]>;
  deploymentComponents: ProfileField<string[]>;
  customerRoles: ProfileField<string[]>;
  dataInteractionModel: ProfileField<DataInteractionModel>;
    structuredCapabilities: ProfileField<Capability[]>;
  procurementRiskAreas: ProfileField<ProcurementRiskArea[]>;
  tailoringConfidence: number;
  mode: TailoringMode;
  pagesScanned: string[];
};

/** Minimal workspace row needed to build a company profile */
export type WorkspaceProfileInput = {
  id?: string;
  name: string;
  industry?: string[] | null;
  productType?: string[] | null;
  customerSegment?: string[] | null;
  dataTypes: string[];
  complianceTargets: string[];
  deepProfileJson?: Prisma.JsonValue | null;
};

function isNonEmptyString(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonEmptyArray<T>(v: T[] | null | undefined): v is T[] {
  return Array.isArray(v) && v.length > 0;
}

/** Coerce persisted / inferred JSON into string[] so downstream code never throws on `.join` / `.some` / spread. */
export function coerceProfileStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function parseDeepProfile(json: Prisma.JsonValue | null | undefined): DeepInferredProfile | null {
  if (json === null || json === undefined) return null;
  if (typeof json !== "object" || Array.isArray(json)) return null;
  return json as DeepInferredProfile;
}

function scalarField<T>(
  columnValue: T | null | undefined,
  inferred: Signal<T> | undefined,
  emptyCheck: (v: T | null | undefined) => boolean,
  defaultValue: T,
): ProfileField<T> {
  if (emptyCheck(columnValue)) {
    return {
      value: columnValue as T,
      source: "user-confirmed",
      confidence: 1.0,
    };
  }
  if (inferred) {
    const confidence = typeof inferred.confidence === "number" ? inferred.confidence : 0;
    return {
      value: inferred.value,
      source: "ai-inferred",
      confidence,
      category: inferred.category,
      inferenceSource: inferred.source,
      citations: inferred.citations,
      candidates: inferred.candidates,
      conflict: inferred.conflict,
    };
  }
  return {
    value: defaultValue,
    source: "default",
    confidence: 0,
  };
}


/**
 * Deep-only fields (no workspace column): read from inference signal.
 * When `minConfidence` is set and the signal is below it, treat as empty default.
 */
function signalArrayField(
  inferred: Signal<string[]> | undefined,
  minConfidence?: number,
): ProfileField<string[]> {
  if (!inferred) {
    return { value: [], source: "default", confidence: 0 };
  }

  // Safety check for confidence
  const confidence = typeof inferred.confidence === "number" ? inferred.confidence : 0;

  if (minConfidence !== undefined && confidence < minConfidence) {
    return { value: [], source: "default", confidence: 0 };
  }
  return {
    value: coerceProfileStringArray(inferred.value),
    source: "ai-inferred",
    confidence,
    category: inferred.category,
    inferenceSource: inferred.source,
    citations: inferred.citations,
    candidates: inferred.candidates,
    conflict: inferred.conflict,
  };
}

function capabilityArrayField(
  inferred: Signal<Capability[]> | undefined,
  minConfidence?: number,
): ProfileField<Capability[]> {
  if (!inferred) {
    return { value: [], source: "default", confidence: 0 };
  }

  const confidence = typeof inferred.confidence === "number" ? inferred.confidence : 0;
  if (minConfidence !== undefined && confidence < minConfidence) {
    return { value: [], source: "default", confidence: 0 };
  }
  
  return {
    value: inferred.value || [],
    source: "ai-inferred",
    confidence,
    category: inferred.category,
    inferenceSource: inferred.source,
    citations: inferred.citations,
  };
}

function procurementRiskAreaArrayField(
  inferred: Signal<ProcurementRiskArea[]> | undefined,
  minConfidence?: number,
): ProfileField<ProcurementRiskArea[]> {
  if (!inferred) {
    return { value: [], source: "default", confidence: 0 };
  }

  const confidence = typeof inferred.confidence === "number" ? inferred.confidence : 0;
  if (minConfidence !== undefined && confidence < minConfidence) {
    return { value: [], source: "default", confidence: 0 };
  }
  
  return {
    value: inferred.value || [],
    source: "ai-inferred",
    confidence,
    category: inferred.category,
    inferenceSource: inferred.source,
    citations: inferred.citations,
  };
}

function hasObservedAiField(cp: CompanyProfile): boolean {
  const fields: ProfileField<unknown>[] = [
    cp.industry,
    cp.productType,
    cp.customerSegment,
    cp.dataTypes,
    cp.complianceSignals,
    cp.userTypes,
    cp.internalRoles,
    cp.operationalWorkflows,
    cp.trustClaims,
    cp.riskAreas,
  ];
  return fields.some(f => f.source === "ai-inferred" && f.category === "OBSERVED");
}

function hasObservedBusinessField(cp: CompanyProfile): boolean {
  const fields: ProfileField<unknown>[] = [
    cp.industry,
    cp.productType,
    cp.customerSegment,
    cp.userTypes,
    cp.internalRoles,
    cp.operationalWorkflows,
  ];
  return fields.some(f => f.source === "ai-inferred" && f.category === "OBSERVED");
}

function hasObservedComplianceField(cp: CompanyProfile): boolean {
  const fields: ProfileField<unknown>[] = [
    cp.dataTypes,
    cp.complianceSignals,
    cp.trustClaims,
    cp.riskAreas,
  ];
  return fields.some(f => f.source === "ai-inferred" && f.category === "OBSERVED");
}

function deriveMode(tailoringConfidence: number, cp: CompanyProfile): TailoringMode {
  const bus = hasObservedBusinessField(cp);
  const comp = hasObservedComplianceField(cp);
  if (!bus) return "LIMITED_FALLBACK";
  if (!comp) return "STANDARD_GUIDANCE";
  if (tailoringConfidence > 0.7 && hasObservedAiField(cp)) return "HIGH_PRECISION";
  return "STANDARD_GUIDANCE";
}

/** For pack / doc rules: unset fields must not pick up inference defaults. */
export function effectiveScalarForRules(f: ProfileField<string[]>): string {
  if (f.source === "default") return "";
  const vals = coerceProfileStringArray(f.value);
  return vals.length > 0 ? vals[0] : "";
}

/** 
 * Returns the primary (first) value for rules that still expect a single scalar. 
 * @deprecated Use effectiveArrayForRules where possible.
 */
export function primaryValueForRules(f: ProfileField<string[]>): string {
  return effectiveScalarForRules(f);
}

/** Arrays: default source means "no signal" for declarative rules. */
export function effectiveArrayForRules(f: ProfileField<string[]>): string[] {
  return f.source === "default" ? [] : coerceProfileStringArray(f.value);
}

const DEFAULT_DATA_INTERACTION: DataInteractionModel = {
  accessesCustomerData: false,
  processesSensitiveData: false,
  storesCustomerData: false,
  scansInfrastructure: false,
  integratesWithCloudProviders: false,
  usesAIOnCustomerData: false,
  handlesPayments: false,
  handlesPII: false,
};

export class CompanyProfileService {
  /**
   * Single source of truth: user-confirmed workspace scalars override
   * persisted inference in `deepProfileJson`, with confidence on each field.
   */
  static build(workspace: WorkspaceProfileInput): CompanyProfile {
    const inference = parseDeepProfile(workspace.deepProfileJson);
    const workspaceId = workspace.id ?? "";

    const industryRaw = scalarField(
      workspace.industry,
      inference?.industry ? ({ ...inference.industry, value: [inference.industry.value] } as any) : undefined,
      isNonEmptyArray,
      [] as string[],
    );
    const industry = { ...industryRaw, value: coerceProfileStringArray(industryRaw.value) };

    const productTypeRaw = scalarField(
      workspace.productType,
      inference?.productType ? ({ ...inference.productType, value: [inference.productType.value] } as any) : undefined,
      isNonEmptyArray,
      [] as string[],
    );
    const productType = { ...productTypeRaw, value: coerceProfileStringArray(productTypeRaw.value) };

    const customerSegmentRaw = scalarField(
      workspace.customerSegment,
      inference?.customerSegment ? ({ ...inference.customerSegment, value: [inference.customerSegment.value] } as any) : undefined,
      isNonEmptyArray,
      [] as string[],
    );
    const customerSegment = { ...customerSegmentRaw, value: coerceProfileStringArray(customerSegmentRaw.value) };

    const dataTypesRaw = scalarField(
      workspace.dataTypes,
      inference?.dataTypes,
      isNonEmptyArray,
      [] as string[],
    );
    const dataTypes = { ...dataTypesRaw, value: coerceProfileStringArray(dataTypesRaw.value) };

    const complianceRaw = scalarField(
      workspace.complianceTargets,
      inference?.complianceSignals,
      isNonEmptyArray,
      [] as string[],
    );
    const complianceSignals = { ...complianceRaw, value: coerceProfileStringArray(complianceRaw.value) };

    const userTypes = signalArrayField(inference?.userTypes);
    const internalRoles = signalArrayField(inference?.internalRoles, 0.5);
    const operationalWorkflows = signalArrayField(inference?.operationalWorkflows);
    const trustClaims = signalArrayField(inference?.trustClaims);
    const riskAreas = signalArrayField(inference?.riskAreas);
    const namedComplianceFrameworks = signalArrayField(inference?.namedComplianceFrameworks || inference?.complianceSignals);
    const vendorCertifications = signalArrayField(inference?.vendorCertifications);
    const productSupportedFrameworks = signalArrayField(inference?.productSupportedFrameworks);
    const privacyPostureSignals = signalArrayField(inference?.privacyPostureSignals);
    const businessDomain = scalarField(undefined, inference?.businessDomain, () => false, "");
    const solutionCategories = signalArrayField(inference?.solutionCategories);
    const productLines = signalArrayField(inference?.productLines);
    const useCases = signalArrayField(inference?.useCases);
    const deploymentComponents = signalArrayField(inference?.deploymentComponents);
    const customerRoles = signalArrayField(inference?.customerRoles);
    
    // Support both legacy string and new structured DataInteractionModel
    const dataInteractionModel = scalarField<DataInteractionModel>(
      undefined, 
      inference?.dataInteractionModel as any, 
      () => false, 
      DEFAULT_DATA_INTERACTION
    );
    
    const structuredCapabilities = capabilityArrayField(inference?.structuredCapabilities);
    const procurementRiskAreas = procurementRiskAreaArrayField(inference?.procurementRiskAreas);

    const tailoringConfidence = inference?.tailoringConfidence ?? 0.3;
    const pagesScanned = inference?.pagesScanned ?? [];

    const draft: CompanyProfile = {
      workspaceId,
      companyName: workspace.name,
      industry,
      productType,
      customerSegment,
      dataTypes,
      complianceSignals,
      namedComplianceFrameworks,
      vendorCertifications,
      productSupportedFrameworks,
      privacyPostureSignals,
      userTypes,
      internalRoles,
      operationalWorkflows,
      trustClaims,
      riskAreas,
      businessDomain,
      solutionCategories,
      productLines,
      useCases,
      deploymentComponents,
      customerRoles,
      dataInteractionModel,
      structuredCapabilities,
      procurementRiskAreas,
      tailoringConfidence,
      mode: workspace.tailoringMode as TailoringMode || "AUTO",
      pagesScanned,
    };
    draft.mode = deriveMode(tailoringConfidence, draft);
    return draft;
  }

  /** Flat projection for legacy consumers (TailoringEngine, enrichment prompts). */
  static toTailoredProfile(cp: CompanyProfile): TailoredProfile {
    const signalsUsed: TailoredProfile["signalsUsed"] = [];

    const pushIfAi = (fieldName: string, f: ProfileField<unknown>) => {
      if (f.source !== "ai-inferred") return;
      if (f.category === undefined) return;
      signalsUsed.push({
        field: fieldName,
        category: f.category,
        source: f.inferenceSource,
        citations: f.citations,
      });
    };

    pushIfAi("industry", cp.industry);
    pushIfAi("productType", cp.productType);
    pushIfAi("customerSegment", cp.customerSegment);
    pushIfAi("dataTypes", cp.dataTypes);
    pushIfAi("complianceSignals", cp.complianceSignals);
    pushIfAi("userTypes", cp.userTypes);
    pushIfAi("internalRoles", cp.internalRoles);
    pushIfAi("operationalWorkflows", cp.operationalWorkflows);
    pushIfAi("trustClaims", cp.trustClaims);
    pushIfAi("riskAreas", cp.riskAreas);
    pushIfAi("businessDomain", cp.businessDomain);
    pushIfAi("solutionCategories", cp.solutionCategories);
    pushIfAi("productLines", cp.productLines);
    pushIfAi("useCases", cp.useCases);
    pushIfAi("deploymentComponents", cp.deploymentComponents);
    pushIfAi("dataInteractionModel", cp.dataInteractionModel);
    pushIfAi("namedComplianceFrameworks", cp.namedComplianceFrameworks);
    pushIfAi("privacyPostureSignals", cp.privacyPostureSignals);
    pushIfAi("vendorCertifications", cp.vendorCertifications);
    pushIfAi("productSupportedFrameworks", cp.productSupportedFrameworks);
    pushIfAi("privacyPostureSignals", cp.privacyPostureSignals);

    return {
      companyName: cp.companyName,
      industry: coerceProfileStringArray(cp.industry.value),
      productType: coerceProfileStringArray(cp.productType.value),
      customerSegment: coerceProfileStringArray(cp.customerSegment.value),
      dataTypes: coerceProfileStringArray(cp.dataTypes.value),
      complianceSignals: coerceProfileStringArray(cp.complianceSignals.value),
      userTypes: coerceProfileStringArray(cp.userTypes.value),
      internalRoles: coerceProfileStringArray(cp.internalRoles.value),
      operationalWorkflows: coerceProfileStringArray(cp.operationalWorkflows.value),
      trustClaims: coerceProfileStringArray(cp.trustClaims.value),
      riskAreas: coerceProfileStringArray(cp.riskAreas.value),
      mode: cp.mode,
      confidence: cp.tailoringConfidence,
      signalsUsed,
    };
  }
}

/** Extra prompt context from deep website intelligence (only non-default fields). */
export function formatDeepIntelPromptBlock(cp: CompanyProfile): string {
  const lines: string[] = [];
  const add = (label: string, f: ProfileField<string[]>) => {
    if (f.source === "default") return;
    const values = coerceProfileStringArray(f.value);
    if (!values.length) return;
    
    // Safety check for confidence value to prevent crash on toFixed
    const conf = typeof f.confidence === "number" ? f.confidence : 0;
    
    lines.push(
      `- ${label} (${f.source}, confidence=${conf.toFixed(2)}): ${values.join("; ")}`,
    );
  };
  add("User types", cp.userTypes);
  add("Internal roles", cp.internalRoles);
  add("Operational workflows", cp.operationalWorkflows);
  add("Trust claims (from site)", cp.trustClaims);
  add("Risk areas (from site)", cp.riskAreas);
  add("Verified frameworks", cp.namedComplianceFrameworks);
  add("Privacy focus", cp.privacyPostureSignals);

  // Add structured capabilities
  if (cp.structuredCapabilities.source !== "default" && cp.structuredCapabilities.value.length > 0) {
    const caps = cp.structuredCapabilities.value.map(c => `${c.name} (${c.normalizedKey})`);
    lines.push(`- Capabilities: ${caps.join("; ")}`);
  }

  if (lines.length === 0) return "";
  return `DEEP WEBSITE INTELLIGENCE (use only when relevant to the document):\n${lines.join("\n")}\n`;
}

