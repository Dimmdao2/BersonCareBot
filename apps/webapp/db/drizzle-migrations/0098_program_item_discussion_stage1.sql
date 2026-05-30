CREATE TABLE "program_item_discussion_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "instance_stage_item_id" uuid NOT NULL,
  "patient_user_id" uuid NOT NULL,
  "sender_role" text NOT NULL,
  "origin" text NOT NULL,
  "body" text,
  "media_file_id" uuid,
  "support_message_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "program_item_discussion_messages_sender_role_check"
    CHECK ("program_item_discussion_messages"."sender_role" = ANY (ARRAY['patient'::text, 'admin'::text])),
  CONSTRAINT "program_item_discussion_messages_origin_check"
    CHECK ("program_item_discussion_messages"."origin" = ANY (ARRAY['patient_observation'::text, 'support_admin_reply'::text])),
  CONSTRAINT "program_item_discussion_messages_payload_check"
    CHECK (("program_item_discussion_messages"."body" IS NOT NULL) OR ("program_item_discussion_messages"."media_file_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "program_item_discussion_reads" (
  "patient_user_id" uuid NOT NULL,
  "instance_stage_item_id" uuid NOT NULL,
  "last_read_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "program_item_discussion_reads_pkey" PRIMARY KEY("patient_user_id", "instance_stage_item_id")
);
--> statement-breakpoint
ALTER TABLE "program_item_discussion_messages"
  ADD CONSTRAINT "program_item_discussion_messages_stage_item_id_fkey"
  FOREIGN KEY ("instance_stage_item_id") REFERENCES "public"."treatment_program_instance_stage_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_item_discussion_messages"
  ADD CONSTRAINT "program_item_discussion_messages_patient_user_id_fkey"
  FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_item_discussion_messages"
  ADD CONSTRAINT "program_item_discussion_messages_media_file_id_fkey"
  FOREIGN KEY ("media_file_id") REFERENCES "public"."media_files"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_item_discussion_messages"
  ADD CONSTRAINT "program_item_discussion_messages_support_message_id_fkey"
  FOREIGN KEY ("support_message_id") REFERENCES "public"."support_conversation_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_item_discussion_reads"
  ADD CONSTRAINT "program_item_discussion_reads_patient_user_id_fkey"
  FOREIGN KEY ("patient_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "program_item_discussion_reads"
  ADD CONSTRAINT "program_item_discussion_reads_stage_item_id_fkey"
  FOREIGN KEY ("instance_stage_item_id") REFERENCES "public"."treatment_program_instance_stage_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_program_item_discussion_item_created"
  ON "program_item_discussion_messages" USING btree ("instance_stage_item_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_program_item_discussion_patient_created"
  ON "program_item_discussion_messages" USING btree ("patient_user_id","created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_program_item_discussion_support_message_id"
  ON "program_item_discussion_messages" USING btree ("support_message_id")
  WHERE "program_item_discussion_messages"."support_message_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "idx_program_item_discussion_reads_item"
  ON "program_item_discussion_reads" USING btree ("instance_stage_item_id");
--> statement-breakpoint
ALTER TABLE "media_files" ADD COLUMN IF NOT EXISTS "usage_purpose" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'media_files_usage_purpose_check'
  ) THEN
    ALTER TABLE "media_files"
      ADD CONSTRAINT "media_files_usage_purpose_check"
      CHECK (("usage_purpose" IS NULL) OR ("usage_purpose" = ANY (ARRAY['program_item_submission'::text])));
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "program_item_discussion_messages" (
  "instance_stage_item_id",
  "patient_user_id",
  "sender_role",
  "origin",
  "body",
  "created_at"
)
SELECT
  pal."instance_stage_item_id",
  pal."patient_user_id",
  'patient',
  'patient_observation',
  btrim(pal."note"),
  pal."created_at"
FROM "program_action_log" pal
JOIN "treatment_program_instances" tpi
  ON tpi."id" = pal."instance_id"
JOIN "treatment_program_instance_stage_items" item
  ON item."id" = pal."instance_stage_item_id"
JOIN "treatment_program_instance_stages" tps
  ON tps."id" = item."stage_id"
WHERE pal."action_type" = 'note'
  AND COALESCE(pal."payload"->>'source', '') = 'patient_observation'
  AND pal."note" IS NOT NULL
  AND btrim(pal."note") <> ''
  AND tpi."patient_user_id" = pal."patient_user_id"
  AND tpi."assignment_source" = 'doctor'
  AND item."status" = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM "program_item_discussion_messages" m
    WHERE m."instance_stage_item_id" = pal."instance_stage_item_id"
      AND m."patient_user_id" = pal."patient_user_id"
      AND m."sender_role" = 'patient'
      AND m."origin" = 'patient_observation'
      AND m."created_at" = pal."created_at"
      AND COALESCE(m."body", '') = btrim(pal."note")
  );
