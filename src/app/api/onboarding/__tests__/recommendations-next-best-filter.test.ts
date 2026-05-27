import { describe, it, expect } from "vitest";
import { shouldShowNextBestAction } from "@/app/api/onboarding/recommendations/route";

describe("shouldShowNextBestAction", () => {
  it("shows invite_reviewer until linked recommendation ids are satisfied", () => {
    const satisfied = new Set<string>(["rec-a"]);
    expect(
      shouldShowNextBestAction(
        { actionType: "invite_reviewer", linkedRecommendationIds: ["rec-a"] },
        satisfied,
      ),
    ).toBe(false);
    expect(
      shouldShowNextBestAction(
        { actionType: "invite_reviewer", linkedRecommendationIds: ["rec-b"] },
        satisfied,
      ),
    ).toBe(true);
  });

  it("hides upload_document when all linked ids are satisfied", () => {
    const satisfied = new Set(["doc-1", "doc-2"]);
    expect(
      shouldShowNextBestAction(
        { actionType: "upload_document", linkedRecommendationIds: ["doc-1", "doc-2"] },
        satisfied,
      ),
    ).toBe(false);
    expect(
      shouldShowNextBestAction(
        { actionType: "upload_document", linkedRecommendationIds: ["doc-1"] },
        satisfied,
      ),
    ).toBe(true);
  });

  it("always shows actions without linked ids", () => {
    const satisfied = new Set<string>();
    expect(shouldShowNextBestAction({ actionType: "invite_reviewer", linkedRecommendationIds: [] }, satisfied)).toBe(
      true,
    );
    expect(
      shouldShowNextBestAction({ actionType: "review_topics", linkedRecommendationIds: ["x"] }, satisfied),
    ).toBe(true);
  });
});
