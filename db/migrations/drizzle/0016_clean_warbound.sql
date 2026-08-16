CREATE TABLE "pet_caregivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid,
	"invited_email" varchar(255) NOT NULL,
	"invited_by" uuid NOT NULL,
	"relation" varchar(30) DEFAULT 'family' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"milestone_key" varchar(60) NOT NULL,
	"title" varchar(180) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "symptom_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"symptoms" text NOT NULL,
	"urgency" varchar(20) DEFAULT 'medium' NOT NULL,
	"concern" text,
	"advice" text,
	"should_see_vet" boolean DEFAULT false NOT NULL,
	"follow_up_at" timestamp with time zone,
	"followed_up_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pet_caregivers" ADD CONSTRAINT "pet_caregivers_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_caregivers" ADD CONSTRAINT "pet_caregivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_caregivers" ADD CONSTRAINT "pet_caregivers_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_milestones" ADD CONSTRAINT "pet_milestones_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD CONSTRAINT "symptom_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_reports" ADD CONSTRAINT "symptom_reports_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pet_caregiver_email" ON "pet_caregivers" USING btree ("pet_id","invited_email");--> statement-breakpoint
CREATE INDEX "idx_pet_caregivers_pet" ON "pet_caregivers" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_pet_caregivers_user" ON "pet_caregivers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pet_caregivers_status" ON "pet_caregivers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pet_milestone" ON "pet_milestones" USING btree ("pet_id","milestone_key");--> statement-breakpoint
CREATE INDEX "idx_pet_milestones_pet" ON "pet_milestones" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_symptom_reports_user" ON "symptom_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_symptom_reports_pet" ON "symptom_reports" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_symptom_reports_follow_up" ON "symptom_reports" USING btree ("follow_up_at");--> statement-breakpoint
CREATE INDEX "idx_tasks_completed_at" ON "tasks" USING btree ("completed_at");