-- Applied automatically at backend startup as migration:
-- 20260606_recording_segments
ALTER TABLE "Recording"
ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;

UPDATE "Recording"
SET "durationMs" = ROUND(EXTRACT(EPOCH FROM ("endTime" - "startTime")) * 1000)::INTEGER
WHERE "durationMs" IS NULL;

CREATE INDEX IF NOT EXISTS "Recording_groupId_startTime_idx"
ON "Recording" ("groupId", "startTime");

CREATE INDEX IF NOT EXISTS "Recording_userId_startTime_idx"
ON "Recording" ("userId", "startTime");
