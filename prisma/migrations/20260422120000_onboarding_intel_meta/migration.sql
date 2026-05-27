-- Lightweight onboarding intelligence / provenance snapshot (no raw crawl payloads)
ALTER TABLE "Workspace" ADD COLUMN "onboardingIntelMetaJson" JSONB;
