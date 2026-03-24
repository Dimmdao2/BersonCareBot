-- Stage 8: messaging read/delivery/media + indexes for unread queries.
-- Webapp-originated rows use integrator_message_id = 'webapp-msg:' || gen_random_uuid()::text (see modules/messaging).

ALTER TABLE support_conversation_messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE support_conversation_messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE support_conversation_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE support_conversation_messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_conv_msg_conv_created
  ON support_conversation_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_conv_msg_unread_incoming
  ON support_conversation_messages (conversation_id)
  WHERE read_at IS NULL AND sender_role <> 'user';

CREATE INDEX IF NOT EXISTS idx_support_conv_msg_unread_user_msgs
  ON support_conversation_messages (conversation_id)
  WHERE read_at IS NULL AND sender_role = 'user';
