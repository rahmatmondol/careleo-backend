CREATE TABLE "admin_notification_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"event_key" varchar(200) NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_notification_reads" ADD CONSTRAINT "admin_notification_reads_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_admin_notification_reads_admin_event" ON "admin_notification_reads" USING btree ("admin_id","event_key");--> statement-breakpoint
CREATE INDEX "idx_admin_notification_reads_admin" ON "admin_notification_reads" USING btree ("admin_id");