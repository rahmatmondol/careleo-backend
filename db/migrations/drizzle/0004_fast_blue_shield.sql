CREATE TABLE "pet_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"category" varchar(40) DEFAULT 'other' NOT NULL,
	"fact" text NOT NULL,
	"source" varchar(20) DEFAULT 'chat' NOT NULL,
	"session_id" uuid,
	"confidence" numeric(3, 2) DEFAULT '1' NOT NULL,
	"superseded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"diet_brand" varchar(200),
	"diet_type" varchar(120),
	"daily_amount" varchar(120),
	"activity_level" varchar(120),
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"health_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"medications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"vaccination_status" varchar(200),
	"grooming_notes" text,
	"behavior_notes" text,
	"completeness" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pet_facts" ADD CONSTRAINT "pet_facts_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_facts" ADD CONSTRAINT "pet_facts_session_id_ai_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_profiles" ADD CONSTRAINT "pet_profiles_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pet_facts_pet_id" ON "pet_facts" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_pet_facts_category" ON "pet_facts" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pet_profiles_pet_id" ON "pet_profiles" USING btree ("pet_id");