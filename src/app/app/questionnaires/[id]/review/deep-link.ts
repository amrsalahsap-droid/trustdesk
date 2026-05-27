/**
 * Pure helper for the `/app/questionnaires/[id]/review?itemId=...` deep link. Extracted
 * from the review page so the resolution rules can be unit-tested without mounting the
 * full React tree or standing up a DOM environment.
 */

export interface DeepLinkCandidate {
  /** Questionnaire item id present in the current review fetch. */
  id: string;
}

/**
 * Decide which questionnaire item (if any) should be activated in response to a deep
 * link. The link is only honoured when:
 *   - an `itemId` query param was provided,
 *   - the review list has finished loading at least once,
 *   - the target item exists in the loaded list (prevents stale/expired links from
 *     silently activating an unrelated row).
 *
 * Returning `null` means "do nothing" — the caller preserves any in-memory selection.
 */
export function resolveDeepLinkActiveId<T extends DeepLinkCandidate>(
  deepLinkItemId: string | null,
  questions: ReadonlyArray<T>,
): string | null {
  if (!deepLinkItemId) return null;
  if (questions.length === 0) return null;
  return questions.some((q) => q.id === deepLinkItemId) ? deepLinkItemId : null;
}
