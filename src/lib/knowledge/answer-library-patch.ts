import type { AnswerLibraryItem, AnswerStatus, OverrideReasonCategory, OverrideScope } from "@prisma/client";

export type AnswerLibraryPatchBody = {
  title?: string;
  answer?: string | null;
  topicId?: string | null;
  owner?: string | null;
  ownerId?: string | null;
  approverId?: string | null;
  status?: AnswerStatus;
  confidenceScore?: number | null;
  subControlKey?: string | null;
  subControlLabels?: string[];
  /** Override topic/workspace cadence (90/180/365); null clears override. */
  reviewCadenceDays?: number | null;
  changeReason?: string;
  overrideReasonCategory?: OverrideReasonCategory | null;
  overrideComment?: string | null;
  overrideScope?: OverrideScope | null;
};

export type MergedAnswerLibraryPatch = Pick<
  AnswerLibraryItem,
  | "title"
  | "answer"
  | "topicId"
  | "owner"
  | "ownerId"
  | "approverId"
  | "status"
  | "confidenceScore"
  | "subControlKey"
  | "subControlLabels"
  | "reviewCadenceDays"
  | "overrideReasonCategory"
  | "overrideComment"
  | "overrideScope"
>;

function strEq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "") === (b ?? "");
}

function scoreEq(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

function arrEq(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const aa = a ?? [];
  const bb = b ?? [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

export function mergeAnswerLibraryPatch(
  existing: Pick<
    AnswerLibraryItem,
    | "title"
    | "answer"
    | "topicId"
    | "owner"
    | "ownerId"
    | "approverId"
    | "status"
    | "confidenceScore"
    | "subControlKey"
    | "subControlLabels"
    | "reviewCadenceDays"
    | "overrideReasonCategory"
    | "overrideComment"
    | "overrideScope"
  >,
  body: AnswerLibraryPatchBody,
): MergedAnswerLibraryPatch {
  return {
    title: body.title !== undefined ? body.title : existing.title,
    answer: body.answer !== undefined ? body.answer : existing.answer,
    topicId: body.topicId !== undefined ? body.topicId : existing.topicId,
    owner: body.owner !== undefined ? body.owner : existing.owner,
    ownerId: body.ownerId !== undefined ? body.ownerId : existing.ownerId,
    approverId: body.approverId !== undefined ? body.approverId : existing.approverId,
    status: body.status !== undefined ? body.status : existing.status,
    confidenceScore:
      body.confidenceScore !== undefined ? body.confidenceScore : existing.confidenceScore,
    subControlKey:
      body.subControlKey !== undefined ? body.subControlKey : existing.subControlKey,
    subControlLabels:
      body.subControlLabels !== undefined
        ? body.subControlLabels
        : existing.subControlLabels,
    reviewCadenceDays:
      body.reviewCadenceDays !== undefined ? body.reviewCadenceDays : existing.reviewCadenceDays,
    overrideReasonCategory:
      body.overrideReasonCategory !== undefined
        ? body.overrideReasonCategory
        : existing.overrideReasonCategory,
    overrideComment:
      body.overrideComment !== undefined ? body.overrideComment : existing.overrideComment,
    overrideScope: body.overrideScope !== undefined ? body.overrideScope : existing.overrideScope,
  };
}

export function hasAnswerLibraryPatchChanges(
  existing: Pick<
    AnswerLibraryItem,
    | "title"
    | "answer"
    | "topicId"
    | "owner"
    | "ownerId"
    | "approverId"
    | "status"
    | "confidenceScore"
    | "subControlKey"
    | "subControlLabels"
    | "reviewCadenceDays"
    | "overrideReasonCategory"
    | "overrideComment"
    | "overrideScope"
  >,
  merged: MergedAnswerLibraryPatch,
): boolean {
  return (
    existing.title !== merged.title ||
    !strEq(existing.answer, merged.answer) ||
    existing.topicId !== merged.topicId ||
    !strEq(existing.owner, merged.owner) ||
    existing.ownerId !== merged.ownerId ||
    existing.approverId !== merged.approverId ||
    existing.status !== merged.status ||
    !scoreEq(existing.confidenceScore, merged.confidenceScore) ||
    !strEq(existing.subControlKey, merged.subControlKey) ||
    !arrEq(existing.subControlLabels, merged.subControlLabels) ||
    existing.reviewCadenceDays !== merged.reviewCadenceDays ||
    existing.overrideReasonCategory !== merged.overrideReasonCategory ||
    !strEq(existing.overrideComment, merged.overrideComment) ||
    existing.overrideScope !== merged.overrideScope
  );
}
