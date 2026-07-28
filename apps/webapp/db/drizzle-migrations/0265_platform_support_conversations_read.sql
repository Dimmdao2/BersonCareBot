-- Global administrators may read the support text addressed to the platform.
-- This is intentionally SELECT-only and limited to the existing ticket/thread tables:
-- no platform_users, clinical records, diagnoses, programs, or delivery-event access.

GRANT SELECT ON TABLE
  public.support_conversations,
  public.support_conversation_messages
  TO app_platform_settings;

DROP POLICY IF EXISTS support_conversations_platform_operations_select
  ON public.support_conversations;
CREATE POLICY support_conversations_platform_operations_select
  ON public.support_conversations
  FOR SELECT TO app_platform_settings
  USING (true);

DROP POLICY IF EXISTS support_conversation_messages_platform_operations_select
  ON public.support_conversation_messages;
CREATE POLICY support_conversation_messages_platform_operations_select
  ON public.support_conversation_messages
  FOR SELECT TO app_platform_settings
  USING (true);

DO $check$
BEGIN
  IF NOT (
    has_table_privilege(
      'app_platform_settings',
      'public.support_conversations',
      'SELECT'
    )
    AND has_table_privilege(
      'app_platform_settings',
      'public.support_conversation_messages',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.support_conversations',
      'INSERT'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.support_conversations',
      'UPDATE'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.support_conversation_messages',
      'INSERT'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.support_conversation_messages',
      'UPDATE'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.platform_users',
      'SELECT'
    )
  ) THEN
    RAISE EXCEPTION 'platform_support_conversations_read_wall_failed';
  END IF;
END
$check$;
