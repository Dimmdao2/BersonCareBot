-- 0265 was initially based on a false classification: these are patient-to-clinic
-- communication tables, not a dedicated platform helpdesk. They include clinical and
-- rehabilitation messages, so the cross-organization platform role must not read them.

DROP POLICY IF EXISTS support_conversations_platform_operations_select
  ON public.support_conversations;
DROP POLICY IF EXISTS support_conversation_messages_platform_operations_select
  ON public.support_conversation_messages;

REVOKE ALL PRIVILEGES ON TABLE
  public.support_conversations,
  public.support_conversation_messages
  FROM app_platform_settings;

DO $check$
BEGIN
  IF NOT (
    NOT has_table_privilege(
      'app_platform_settings',
      'public.support_conversations',
      'SELECT'
    )
    AND NOT has_table_privilege(
      'app_platform_settings',
      'public.support_conversation_messages',
      'SELECT'
    )
  ) THEN
    RAISE EXCEPTION 'platform_support_conversations_isolation_failed';
  END IF;
END
$check$;
