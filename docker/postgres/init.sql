-- PostgreSQL init for Meeting-AI
-- Schema aligned with backend/prisma/schema.prisma

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'PAUSED', 'ENDED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
  "startTime" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "endTime" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "app_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL UNIQUE,
  "value" TEXT NOT NULL,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "app_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" TEXT,
  "type" TEXT NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "app_logs_sessionId_type_idx" ON "app_logs" ("sessionId", "type");
CREATE INDEX IF NOT EXISTS "app_logs_type_idx" ON "app_logs" ("type");

-- Seed app_configs with default values (GLM_API_KEY intentionally empty).
INSERT INTO "app_configs" ("id", "key", "value", "remark", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'GLM_API_KEY', '', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_ENDPOINT', 'https://open.bigmodel.cn/api/paas/v4/chat/completions', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_GLOBAL_CONCURRENCY', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_GLOBAL_MIN_INTERVAL_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_GLOBAL_RATE_LIMIT_COOLDOWN_MS', '2000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_GLOBAL_RATE_LIMIT_MAX_MS', '15000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_ASR_CONCURRENCY', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_ASR_MIN_INTERVAL_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_ASR_RATE_LIMIT_COOLDOWN_MS', '2000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_ASR_RATE_LIMIT_MAX_MS', '15000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_CONCURRENCY', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_CONCURRENCY', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_MIN_INTERVAL_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_MIN_INTERVAL_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_RATE_LIMIT_COOLDOWN_MS', '2000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_RATE_LIMIT_COOLDOWN_MS', '2000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_RATE_LIMIT_MAX_MS', '15000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_REBUILD_RATE_LIMIT_MAX_MS', '15000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_CONCURRENCY', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_MIN_INTERVAL_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_RATE_LIMIT_COOLDOWN_MS', '2000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_EVENT_SEGMENT_TRANSLATION_RATE_LIMIT_MAX_MS', '15000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_ANALYSIS_CONCURRENCY', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_ANALYSIS_MIN_INTERVAL_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_ANALYSIS_RATE_LIMIT_COOLDOWN_MS', '2000', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_ANALYSIS_RATE_LIMIT_MAX_MS', '15000', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_EVENTS_SEGMENT_MAX_IN_FLIGHT', '2', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_EVENTS_SEGMENT_MAX_PENDING_SESSIONS', '300', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_EVENTS_SEGMENT_MAX_STALENESS_MS', '20000', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_AUTO_SPLIT_GAP_MS', '2500', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_MAX_BUFFER_DURATION_SOFT_MS', '30000', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_MAX_BUFFER_DURATION_HARD_MS', '50000', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_DEBUG_LOG_UTTERANCES', '0', NULL, now(), now()),
  (gen_random_uuid(), 'APP_LOG_REQUEST_RESPONSE_ENABLED', '0', NULL, now(), now()),
  (gen_random_uuid(), 'APP_LOG_ERROR_ENABLED', '0', NULL, now(), now()),
  (gen_random_uuid(), 'APP_LOG_SYSTEM_ENABLED', '0', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_SEGMENT_TRANSLATION_ENABLED', '0', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_SEGMENT_TRANSLATION_LANGUAGE', '简体中文', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SEGMENT_TRANSLATION_MODEL', '', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_ANALYSIS_LANGUAGE_ENABLED', '1', NULL, now(), now()),
  (gen_random_uuid(), 'TRANSCRIPT_ANALYSIS_LANGUAGE', '简体中文', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SUMMARY_MODEL', '', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SUMMARY_MAX_TOKENS', '2500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SUMMARY_THINKING', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SEGMENT_ANALYSIS_THINKING', '1', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SUMMARY_RETRY_MAX', '3', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SUMMARY_RETRY_BASE_MS', '500', NULL, now(), now()),
  (gen_random_uuid(), 'GLM_TRANSCRIPT_SUMMARY_RETRY_MAX_MS', '8000', NULL, now(), now())
ON CONFLICT ("key") DO NOTHING;
