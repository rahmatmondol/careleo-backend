ALTER TABLE "pet_cameras" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_consultations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "video_sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "pet_cameras" CASCADE;--> statement-breakpoint
DROP TABLE "video_consultations" CASCADE;--> statement-breakpoint
DROP TABLE "video_sessions" CASCADE;--> statement-breakpoint
ALTER TABLE "vets" ADD COLUMN "email" varchar(180);--> statement-breakpoint
ALTER TABLE "vets" ADD COLUMN "phone" varchar(40);--> statement-breakpoint
ALTER TABLE "vets" ADD COLUMN "status" varchar(20) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "vets" ADD COLUMN "experience_years" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "vets" ADD COLUMN "qualifications_json" text;--> statement-breakpoint
ALTER TABLE "vets" ADD COLUMN "is_available" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_vets_status" ON "vets" USING btree ("status");