-- D5-US-06: rename accepted answer status from VERIFIED to APPROVED

-- Create AnswerStatus enum if it doesn't exist (missing from earlier migrations)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnswerStatus') THEN
        CREATE TYPE "AnswerStatus" AS ENUM ('DRAFT', 'VERIFIED', 'ARCHIVED');
    END IF;
END $$;

-- Rename VERIFIED to APPROVED if both exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AnswerStatus') THEN
        -- Check if VERIFIED exists as a value
        IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid 
                   WHERE t.typname = 'AnswerStatus' AND e.enumlabel = 'VERIFIED') THEN
            -- Only rename if APPROVED doesn't already exist
            IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid 
                          WHERE t.typname = 'AnswerStatus' AND e.enumlabel = 'APPROVED') THEN
                ALTER TYPE "AnswerStatus" RENAME VALUE 'VERIFIED' TO 'APPROVED';
            END IF;
        END IF;
    END IF;
END $$;
