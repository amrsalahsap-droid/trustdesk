/**
 * List of models that MUST be scoped by workspaceId.
 */
export const TENANT_SCOPED_MODELS = [
  "SourceDocument",
  "SourceDocumentChunk",
  "AnswerLibraryItem",
  "Questionnaire",
  "QuestionnaireJob",
  "QuestionnaireItem",
  "Evidence",
  "ExportJob",
  "AnswerLibraryItemVersion",
  "AnswerEvidence",
  "AnswerSeedingJob",
  "AnswerSeedingTopicRun",
  "SourceDocumentContent",
  "SourceChunkTopic",
  "SourceDocumentParseJob",
  "GapFlag",
  "AuditEvent",
  "KnowledgeTopic",
  "ContradictionResult",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

export class MultiTenantScopingError extends Error {
  constructor(model: string, operation: string) {
    super(`Multi-tenant scoping violation: Model ${model} operation ${operation} missing workspaceId filter or data.`);
    this.name = "MultiTenantScopingError";
  }
}

/**
 * Robustly extracts workspaceId from Prisma args, handling both simple fields 
 * and nested compound unique keys (e.g., workspaceId_key: { workspaceId, ... }).
 */
function extractWorkspaceId(obj: any): { found: boolean; value: string | null } {
  if (!obj || typeof obj !== "object") return { found: false, value: null };

  // 1. Check direct property (Standard scalar field)
  if ("workspaceId" in obj) {
    const val = obj.workspaceId;
    if (typeof val === "string" && val) return { found: true, value: val };
    
    // Support for { in: ["workspaceId", "SYSTEM_WORKSPACE"] }
    if (val && typeof val === "object" && Array.isArray(val.in) && val.in.length > 0) {
      const firstNonNull = val.in.find((v: any) => typeof v === "string" && v && v !== "SYSTEM_WORKSPACE");
      return { found: true, value: firstNonNull || "SYSTEM_WORKSPACE" };
    }
  }

  // 2. Check within 'workspace' connection
  if (obj.workspace?.connect?.id) {
    return { found: true, value: obj.workspace.connect.id };
  }

  // 3. Nested Prisma boolean groups
  for (const groupKey of ["OR", "AND"] as const) {
    const branches = obj[groupKey];
    if (!Array.isArray(branches) || branches.length === 0) continue;
    const extracted = branches.map((b: any) => extractWorkspaceId(b));
    const allFound = extracted.every((e) => e.found);
    const values = extracted.map((e) => e.value);
    
    // Find the first "real" tenant ID (not SYSTEM_WORKSPACE)
    const firstTenant = values.find((v) => v != null && v !== "" && v !== "SYSTEM_WORKSPACE");
    const firstNonNull = firstTenant || values.find((v) => v != null && v !== "");

    if (allFound && firstNonNull != null) {
      // Allow mixing the same tenant ID with SYSTEM_WORKSPACE
      const isAllowed = values.every((v) => v === firstNonNull || v === "SYSTEM_WORKSPACE");
      if (isAllowed) {
        return { found: true, value: firstNonNull };
      }
    }
    return { found: false, value: null };
  }

  // 3b. NOT
  if (Array.isArray(obj.NOT) && obj.NOT.length > 0) {
    const extracted = obj.NOT.map((b: any) => extractWorkspaceId(b));
    const foundValues = extracted.filter(
      (e: { found: boolean; value: string | null }) => e.found && e.value != null && e.value !== "",
    );
    if (foundValues.length === 0) {
      // no tenant signal from NOT — fall through
    } else {
      const first = foundValues[0]!.value;
      if (!foundValues.every((e: { value: string | null }) => e.value === first)) {
        return { found: false, value: null };
      }
      return { found: true, value: first };
    }
  }

  // 4. Fallback: Check within compound key objects
  for (const key of Object.keys(obj)) {
    if (key === "OR" || key === "AND" || key === "NOT") continue;
    const val = obj[key];
    if (val && typeof val === "object" && "workspaceId" in val) {
      return { found: true, value: val.workspaceId };
    }
  }

  return { found: false, value: null };
}

const isServer = typeof window === "undefined";

/**
 * Prisma Client Extension that enforces workspaceId scoping on all tenant-owned models.
 * This acts as a "fail-closed" guardrail against cross-tenant leakage.
 */
export const tenantExtension = (() => {
  if (!isServer) return {} as any;
  
  const { Prisma } = require("@prisma/client");
  
  return Prisma.defineExtension((client: any) => {
    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            // 1. Filter out non-tenant-scoped models (e.g. User, Account)
            if (!(TENANT_SCOPED_MODELS as readonly string[]).includes(model)) {
              return query(args);
            }

            // 2. Extract and validate workspaceId from args
            const isKnowledgeTopic = model === "KnowledgeTopic";
            
            if (operation === "findMany" || operation === "findFirst" || operation === "count" || operation === "aggregate") {
              const { found, value } = extractWorkspaceId((args as any).where);
              const isAllowedGlobal = isKnowledgeTopic && (
                value === "SYSTEM_WORKSPACE" || 
                (Array.isArray(value) && value.includes("SYSTEM_WORKSPACE")) ||
                (typeof value === 'object' && (value as any)?.in?.includes("SYSTEM_WORKSPACE"))
              );

              if (!found || (!value && !isAllowedGlobal)) {
                throw new MultiTenantScopingError(model, operation);
              }
            } else if (operation === "create" || operation === "createMany" || operation === "upsert" || operation === "update" || operation === "delete") {
              if (operation === "upsert") {
                const { found: whereFound, value: whereValue } = extractWorkspaceId((args as any).where);
                const { found: createFound, value: createValue } = extractWorkspaceId((args as any).create);
                const { found: updateFound, value: updateValue } = extractWorkspaceId((args as any).update);

                const isAllowedGlobal = isKnowledgeTopic && (whereValue === "SYSTEM_WORKSPACE" || createValue === "SYSTEM_WORKSPACE" || updateValue === "SYSTEM_WORKSPACE");

                if (!whereFound || !createFound || !updateFound || (!whereValue && !isAllowedGlobal)) {
                  throw new MultiTenantScopingError(model, operation);
                }
              } else if (operation === "createMany") {
                const data = (args as any).data;
                if (Array.isArray(data)) {
                  if (data.some((item: any) => {
                    const { found, value } = extractWorkspaceId(item);
                    return !found || (!value && !(isKnowledgeTopic && value === "SYSTEM_WORKSPACE"));
                  })) {
                    throw new MultiTenantScopingError(model, operation);
                  }
                } else {
                  const { found, value } = extractWorkspaceId((args as any).data);
                  const isAllowedGlobal = isKnowledgeTopic && value === "SYSTEM_WORKSPACE";
                  
                  if (!found || (!value && !isAllowedGlobal)) {
                    throw new MultiTenantScopingError(model, operation);
                  }
                }
              }
            }

            return query(args);
          },
        },
      },
    });
  });
})();
