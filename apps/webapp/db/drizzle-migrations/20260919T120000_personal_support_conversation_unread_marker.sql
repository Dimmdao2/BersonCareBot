-- BCB-MIGRATION-OWNER: app_object_owner
-- BCB-MIGRATION-SCHEMA-CREATE: public
-- BCB-MIGRATION-VERIFY: SELECT to_regclass('public.support_conversation_manual_unread') IS NOT NULL
--
-- Rights analysis: creates one application-owned table and two indexes. Runtime reads and writes
-- are performed only by app_staff under the existing doctor workspace principal. The declaration
-- grants SELECT/INSERT/UPDATE/DELETE to app_staff; FORCE RLS restricts rows to the current
-- organization and current actor. No function or SECURITY DEFINER surface is introduced.
CREATE TABLE public.support_conversation_manual_unread (
  organization_id uuid NOT NULL REFERENCES public.be_organizations(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  target_message_id uuid NOT NULL REFERENCES public.support_conversation_messages(id) ON DELETE CASCADE,
  marked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_conversation_manual_unread_pkey
    PRIMARY KEY (organization_id, staff_user_id, conversation_id)
);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_support_manual_unread_conversation
  ON public.support_conversation_manual_unread (organization_id, conversation_id);

--> statement-breakpoint
-- BCB-MIGRATION-OWNER: app_object_owner
CREATE INDEX idx_support_manual_unread_staff
  ON public.support_conversation_manual_unread (organization_id, staff_user_id);
