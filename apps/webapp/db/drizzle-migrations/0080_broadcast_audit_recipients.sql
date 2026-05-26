CREATE TABLE "broadcast_audit_recipients" (
	"audit_id" uuid NOT NULL,
	"platform_user_id" uuid NOT NULL,
	CONSTRAINT "broadcast_audit_recipients_audit_id_platform_user_id_pk" PRIMARY KEY("audit_id","platform_user_id")
);
--> statement-breakpoint
ALTER TABLE "broadcast_audit_recipients" ADD CONSTRAINT "broadcast_audit_recipients_audit_id_broadcast_audit_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."broadcast_audit"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_audit_recipients" ADD CONSTRAINT "broadcast_audit_recipients_platform_user_id_platform_users_id_fk" FOREIGN KEY ("platform_user_id") REFERENCES "public"."platform_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_broadcast_audit_recipients_platform_user_id" ON "broadcast_audit_recipients" USING btree ("platform_user_id" uuid_ops);
