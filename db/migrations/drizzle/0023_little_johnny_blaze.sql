ALTER TABLE "symptom_reports" ADD COLUMN "owner_update" text;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "owner_update_at" timestamp with time zone;