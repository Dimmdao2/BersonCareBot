-- user_questions: one row per user-submitted question; answered flag for "Неотвеченные вопросы".
CREATE TABLE IF NOT EXISTS user_questions (
  id TEXT PRIMARY KEY,
  user_identity_id BIGINT NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  conversation_id TEXT NULL REFERENCES conversations(id) ON DELETE SET NULL,
  telegram_message_id TEXT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered BOOLEAN NOT NULL DEFAULT false,
  answered_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS user_questions_answered_created_idx
  ON user_questions(answered, created_at DESC)
  WHERE answered = false;

CREATE INDEX IF NOT EXISTS user_questions_conversation_id_idx
  ON user_questions(conversation_id)
  WHERE conversation_id IS NOT NULL;

-- question_messages: history of messages in a question thread (user + admin replies).
CREATE TABLE IF NOT EXISTS question_messages (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES user_questions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS question_messages_question_created_idx
  ON question_messages(question_id, created_at ASC);
