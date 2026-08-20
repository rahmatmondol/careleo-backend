ALTER TABLE "symptom_reports" ADD COLUMN "observations_json" text;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "answers_json" text;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "breed_note" text;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "research" text;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "sources_json" text;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "source" varchar(20) DEFAULT 'ai' NOT NULL;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD COLUMN "chat_session_id" uuid;