ALTER TABLE "ai_chat_sessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD COLUMN "summarized_up_to" integer DEFAULT 0 NOT NULL;