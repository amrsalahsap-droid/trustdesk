-- Add sub-control metadata to AnswerLibraryItem so a broad topic can carry
-- multiple approved entries tagged by sub-control (for example an
-- access_control topic with rbac, access_request, access_review,
-- offboarding sub-control entries). The matcher ranks these per-question
-- and the synthesiser composes a question-aware answer from the top
-- candidates, replacing the earlier "reuse one generic answer" behaviour.

ALTER TABLE "AnswerLibraryItem"
  ADD COLUMN "subControlKey" TEXT,
  ADD COLUMN "subControlLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "AnswerLibraryItem_workspaceId_topicId_subControlKey_idx"
  ON "AnswerLibraryItem" ("workspaceId", "topicId", "subControlKey");
