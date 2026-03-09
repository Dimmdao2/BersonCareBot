CREATE TABLE IF NOT EXISTS message_drafts (
  id TEXT PRIMARY KEY,
  identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_chat_id TEXT NULL,
  external_message_id TEXT NULL,
  draft_text_current TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending_confirmation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_drafts_state_check CHECK (state IN ('pending_confirmation'))
);

CREATE UNIQUE INDEX IF NOT EXISTS message_drafts_identity_source_uidx
  ON message_drafts(identity_id, source);

CREATE INDEX IF NOT EXISTS message_drafts_source_updated_idx
  ON message_drafts(source, updated_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  user_identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  admin_scope TEXT NOT NULL,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL,
  last_message_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ NULL,
  close_reason TEXT NULL,
  CONSTRAINT conversations_status_check CHECK (status IN ('open', 'waiting_admin', 'waiting_user', 'closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_open_user_source_uidx
  ON conversations(user_identity_id, source)
  WHERE closed_at IS NULL AND status <> 'closed';

CREATE INDEX IF NOT EXISTS conversations_status_last_message_idx
  ON conversations(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  external_chat_id TEXT NULL,
  external_message_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT conversation_messages_sender_role_check CHECK (sender_role IN ('user', 'admin', 'system'))
);

CREATE INDEX IF NOT EXISTS conversation_messages_conversation_created_idx
  ON conversation_messages(conversation_id, created_at ASC);
