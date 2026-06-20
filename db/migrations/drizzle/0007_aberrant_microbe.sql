CREATE TABLE "vaccinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vaccine_name" varchar(160) NOT NULL,
	"given_at" varchar(40),
	"due_at" varchar(40),
	"status" varchar(20) DEFAULT 'due' NOT NULL,
	"notes" text,
	"last_reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD COLUMN "follow_up_at" varchar(40);--> statement-breakpoint
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_vaccinations_pet_id" ON "vaccinations" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_vaccinations_user_id" ON "vaccinations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vaccinations_status" ON "vaccinations" USING btree ("status");