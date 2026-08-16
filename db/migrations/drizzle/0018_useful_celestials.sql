ALTER TABLE "tasks" ADD COLUMN "alarm_on_miss" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "alarm_dismissals" integer DEFAULT 0 NOT NULL;