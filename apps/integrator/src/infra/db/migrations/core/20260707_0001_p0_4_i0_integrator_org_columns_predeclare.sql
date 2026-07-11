-- P0.4.I0 forward-declare integrator organization_id columns (cross-app migration ordering, taskdb #667).
--
-- WHY THIS EXISTS:
-- On a fresh (prod-shaped) DB the migration order is a cross-app interleave:
--   integrator base (<20260708) -> webapp ALL -> integrator SaaS (>=20260708).
-- webapp RLS migrations 0169/0170 create policies whose predicates REFERENCE
-- integrator.<table>.organization_id, so the COLUMN must already exist when webapp runs.
-- The real column + FK + index + backfill + NOT NULL land later in the 20260708 I1-I4 and
-- 20260710 C1 migrations (which in turn depend on public org tables created by webapp).
-- This migration therefore does ONLY the minimal thing webapp RLS needs: declare the nullable
-- organization_id column ahead of time. It intentionally adds NO FK, NO index, NO backfill and
-- NO NOT NULL constraint — those stay in I1-I4 / C1.
--
-- IDEMPOTENT: every statement is ADD COLUMN IF NOT EXISTS, so on an already-migrated DB (dev,
-- where I1-I4 already ran) this is a safe no-op. The 13 tables below are exactly the set that
-- I1-I4 (20260708_0001..0004) add organization_id to.

ALTER TABLE integrator.contacts
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.content_access_grants
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.conversation_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.conversations
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.mailing_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.mailings
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.message_drafts
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.question_messages
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_questions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_delivery_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_occurrences
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_reminder_rules
  ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE integrator.user_subscriptions
  ADD COLUMN IF NOT EXISTS organization_id uuid;
