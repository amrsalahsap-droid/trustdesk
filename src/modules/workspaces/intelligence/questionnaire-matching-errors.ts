/**
 * Standalone error types for the questionnaire matching pipeline.
 *
 * Kept in a dedicated module (no Prisma / no embedding-service imports) so that
 * light-weight consumers like `src/lib/api/error-handler.ts` can `instanceof`-check
 * the error without pulling the entire AI / DB dependency graph into the client
 * bundle. Importing the full `questionnaire-matching-service` from the error
 * handler causes Next.js to bundle node-only modules (`net`, `agent-base`, ...)
 * into client components that transitively reference it.
 */
export class QuestionnaireMatchingError extends Error {
  override name = "QuestionnaireMatchingError";
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
  }
}
