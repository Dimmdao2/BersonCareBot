-- Stage 5: Support communication history (projection target from integrator).
-- Do not alter message_log or broadcast_audit; they remain doctor-action audit tables.

-- Conversations (one per support thread; linked to platform user when resolved).
CREATE TABLE IF NOT EXISTS support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_conversation_id TEXT NOT NULL UNIQUE,
  platform_user_id UUID NULL REFERENCES platform_users(id) ON DELETE SET NULL,
  integrator_user_id BIGINT NULL,
  source TEXT NOT NULL,
  admin_scope TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NULL,
  close_reason TEXT NULL,
  channel_code TEXT NULL,
  channel_external_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversations_integrator_id
  ON support_conversations (integrator_conversation_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_integrator_user_id
  ON support_conversations (integrator_user_id) WHERE integrator_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_conversations_platform_user_id
  ON support_conversations (platform_user_id) WHERE platform_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message
  ON support_conversations (last_message_at DESC);

-- Conversation messages (support thread messages).
CREATE TABLE IF NOT EXISTS support_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_message_id TEXT NOT NULL UNIQUE,
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  external_chat_id TEXT NULL,
  external_message_id TEXT NULL,
  delivery_status TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_conversation_messages_integrator_id
  ON support_conversation_messages (integrator_message_id);
CREATE INDEX IF NOT EXISTS idx_support_conversation_messages_conversation_created
  ON support_conversation_messages (conversation_id, created_at);

-- User questions (linked to conversation when present).
CREATE TABLE IF NOT EXISTS support_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_question_id TEXT NOT NULL UNIQUE,
  conversation_id UUID NULL REFERENCES support_conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_questions_integrator_id
  ON support_questions (integrator_question_id);
CREATE INDEX IF NOT EXISTS idx_support_questions_conversation_id
  ON support_questions (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_questions_created
  ON support_questions (created_at DESC);

-- Question messages (user + admin replies in question thread).
CREATE TABLE IF NOT EXISTS support_question_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integrator_question_message_id TEXT NOT NULL UNIQUE,
  question_id UUID NOT NULL REFERENCES support_questions(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_question_messages_integrator_id
  ON support_question_messages (integrator_question_message_id);
CREATE INDEX IF NOT EXISTS idx_support_question_messages_question_created
  ON support_question_messages (question_id, created_at);

-- Delivery attempt trail (user-facing delivery status per channel).
CREATE TABLE IF NOT EXISTS support_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_message_id UUID NULL REFERENCES support_conversation_messages(id) ON DELETE SET NULL,
  integrator_intent_event_id TEXT NULL,
  correlation_id TEXT NULL,
  channel_code TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  reason TEXT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_delivery_events_conversation_message
  ON support_delivery_events (conversation_message_id) WHERE conversation_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_delivery_events_intent_event
  ON support_delivery_events (integrator_intent_event_id) WHERE integrator_intent_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_delivery_events_correlation
  ON support_delivery_events (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_delivery_events_channel_occurred
  ON support_delivery_events (channel_code, occurred_at DESC);
