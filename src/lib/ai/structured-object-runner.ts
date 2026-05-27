// src/lib/ai/structured-object-runner.ts

/**
 * Result type for structured object generation with resilience.
 */
export interface StructuredObjectResult<T> {
  ok: boolean;
  value?: T;
  rawResponse?: string;
  failureReason?: 'missing_json' | 'invalid_json' | 'schema_validation_failed' | 'provider_error';
  retryAttempted: boolean;
  repairAttempted: boolean;
  repaired: boolean;
}

/**
 * Generates a structured object using the AI provider with optional retry and repair.
 *
 * @param provider AI provider instance
 * @param schema Zod schema (or similar) for validation – optional
 * @param prompt Prompt string to send
 * @param config Resilience config flags
 */
export async function generateStructuredObjectWithResilience<T>(
  provider: any,
  prompt: string,
  config: {
    strictJsonRetry: boolean;
    schemaRepair: boolean;
    knownSchemas?: Record<string, any>;
  },
  schema?: any
): Promise<StructuredObjectResult<T>> {
  const result: StructuredObjectResult<T> = {
    ok: false,
    retryAttempted: false,
    repairAttempted: false,
    repaired: false,
  };

  // Helper to try parsing JSON response
  const tryParse = (raw: string): T | null => {
    try {
      const parsed = JSON.parse(raw);
      if (schema) {
        // simple validation using schema.safeParse if available
        if (typeof schema.safeParse === 'function') {
          const parsedResult = schema.safeParse(parsed);
          return parsedResult.success ? (parsedResult.data as T) : null;
        }
      }
      return parsed as T;
    } catch {
      return null;
    }
  };

  // First attempt
  try {
    const response = await provider.generateObject<T>(prompt, { id: 'onboarding_deep_inference' }, schema);
    result.rawResponse = response.raw;
    const parsed = tryParse(response.raw);
    if (parsed) {
      result.ok = true;
      result.value = parsed;
      return result;
    }
    // missing or invalid JSON
    result.failureReason = 'invalid_json';
  } catch (e: any) {
    result.failureReason = 'provider_error';
    result.rawResponse = e?.message ?? '';
  }

  // Retry with strict JSON instruction if enabled
  if (config.strictJsonRetry) {
    result.retryAttempted = true;
    const strictPrompt = `${prompt}\n\nPlease respond ONLY with valid JSON matching the expected schema.`;
    try {
      const response = await provider.generateObject<T>(strictPrompt, { id: 'onboarding_deep_inference' }, schema);
      result.rawResponse = response.raw;
      const parsed = tryParse(response.raw);
      if (parsed) {
        result.ok = true;
        result.value = parsed;
        return result;
      }
      result.failureReason = 'invalid_json';
    } catch (e: any) {
      result.failureReason = 'provider_error';
      result.rawResponse = e?.message ?? '';
    }
  }

  // Schema repair attempt (very basic – fill missing top-level keys with null)
  if (config.schemaRepair && config.knownSchemas) {
    result.repairAttempted = true;
    // Only proceed if we have rawResponse that is JSON-like but fails validation
    if (result.rawResponse) {
      try {
        const partial = JSON.parse(result.rawResponse);
        // Insert missing keys from known schema (assumes schema is a Zod object)
        if (schema && typeof schema.shape === 'object') {
          const repaired: any = { ...partial };
          for (const key of Object.keys(schema.shape)) {
            if (!(key in repaired)) {
              repaired[key] = null;
            }
          }
          result.repaired = true;
          result.ok = true;
          result.value = repaired as T;
          return result;
        }
      } catch {}
    }
  }

  // If we reach here, failure
  return result;
}
