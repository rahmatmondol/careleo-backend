CREATE TABLE "medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"date" varchar(30) NOT NULL,
	"vet_name" varchar(180),
	"attachments_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"diet_type" text,
	"activity_level" text,
	"health_conditions" text,
	"preference_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"type" varchar(80) NOT NULL,
	"breed" varchar(160),
	"gender" varchar(30),
	"dob" varchar(30),
	"weight" numeric(10, 2),
	"color" varchar(120),
	"microchip_id" varchar(120),
	"description" text,
	"photo_url" text,
	"ai_analysis_json" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"reminder_type" varchar(60) DEFAULT 'activity' NOT NULL,
	"frequency" varchar(40) DEFAULT 'Everyday' NOT NULL,
	"reminder_date" varchar(30),
	"reminder_time" varchar(20),
	"notes" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"task_type" varchar(60) DEFAULT 'OTHER' NOT NULL,
	"frequency" varchar(40) DEFAULT 'none' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"notes" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_ai_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" varchar(20) NOT NULL,
	"target_id" uuid,
	"instruction" text NOT NULL,
	"reason" text,
	"priority" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text,
	"tool_calls_json" text,
	"tool_results_json" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"is_proactive" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"title" varchar(200),
	"context_snapshot_json" text,
	"is_admin_session" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) NOT NULL,
	"model_name" varchar(100) NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT false,
	"max_tokens_per_day" integer,
	"tokens_used_today" integer DEFAULT 0,
	"cost_per_1k_input" numeric(8, 4),
	"cost_per_1k_output" numeric(8, 4),
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proactive_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"task_id" uuid,
	"message_type" varchar(50) NOT NULL,
	"push_sent_at" timestamp with time zone,
	"chat_sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"action_taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"session_id" uuid,
	"model_name" varchar(80) NOT NULL,
	"feature" varchar(80) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pet_care_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"version" integer DEFAULT 1,
	"plan_json" text NOT NULL,
	"generated_by" varchar(80) DEFAULT 'gemini-1.5-pro',
	"is_active" boolean DEFAULT true,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "woo_products_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"woo_product_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255),
	"status" varchar(40),
	"type" varchar(40),
	"price" numeric(12, 2),
	"regular_price" numeric(12, 2),
	"sale_price" numeric(12, 2),
	"stock_status" varchar(40),
	"image_url" text,
	"payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "woo_products_cache_woo_product_id_unique" UNIQUE("woo_product_id")
);
--> statement-breakpoint
CREATE TABLE "woo_order_items_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"woo_order_id" integer NOT NULL,
	"woo_line_item_id" integer NOT NULL,
	"product_id" integer,
	"variation_id" integer,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total" varchar(40),
	"payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "woo_orders_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"woo_order_id" integer NOT NULL,
	"order_key" varchar(120),
	"status" varchar(40) NOT NULL,
	"currency" varchar(10),
	"total" varchar(40),
	"customer_id" integer,
	"billing_email" varchar(255),
	"payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "woo_orders_cache_woo_order_id_unique" UNIQUE("woo_order_id")
);
--> statement-breakpoint
CREATE TABLE "woo_customers_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"woo_customer_id" integer NOT NULL,
	"email" varchar(255),
	"first_name" varchar(120),
	"last_name" varchar(120),
	"role" varchar(80),
	"payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "woo_customers_cache_woo_customer_id_unique" UNIQUE("woo_customer_id")
);
--> statement-breakpoint
CREATE TABLE "integration_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(40) NOT NULL,
	"job_type" varchar(80) NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"meta" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "woo_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"webhook_id" varchar(120),
	"resource_id" integer,
	"delivery_id" varchar(120) NOT NULL,
	"signature" text,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption_pets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelter_id" uuid,
	"name" varchar(160) NOT NULL,
	"type" varchar(80) NOT NULL,
	"breed" varchar(160),
	"gender" varchar(30),
	"age" varchar(60),
	"size" varchar(40),
	"color" varchar(120),
	"description" text,
	"photo_url" text,
	"status" varchar(30) DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption_quiz_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"answers_json" text NOT NULL,
	"recommended_type" varchar(80),
	"score" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adoption_shelters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(180) NOT NULL,
	"city" varchar(120),
	"state" varchar(120),
	"country" varchar(120),
	"address" text,
	"phone" varchar(80),
	"email" varchar(180),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"type" varchar(20) NOT NULL,
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"appointment_at" varchar(40) NOT NULL,
	"reason" text,
	"notes" text,
	"call_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vet_id" uuid NOT NULL,
	"day_of_week" varchar(20) NOT NULL,
	"start_time" varchar(20) NOT NULL,
	"end_time" varchar(20) NOT NULL,
	"mode" varchar(20) DEFAULT 'both',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"vet_id" uuid NOT NULL,
	"medicines_json" text NOT NULL,
	"instructions" text,
	"refill_count" varchar(10) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" varchar(10) NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vet_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vet_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text,
	"fee" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(180) NOT NULL,
	"bio" text,
	"specialty" varchar(120),
	"location" varchar(180),
	"rating" varchar(10) DEFAULT '0',
	"consultation_fee" varchar(40),
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_booking_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" varchar(10) NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_type" varchar(20) NOT NULL,
	"provider_id" uuid NOT NULL,
	"pet_id" uuid,
	"schedule_at" varchar(40) NOT NULL,
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sitters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(180) NOT NULL,
	"bio" text,
	"location" varchar(180),
	"rating" varchar(10) DEFAULT '0',
	"daily_rate" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walkers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" varchar(180) NOT NULL,
	"bio" text,
	"location" varchar(180),
	"rating" varchar(10) DEFAULT '0',
	"hourly_rate" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_step" integer NOT NULL,
	"step_label" varchar(40) NOT NULL,
	"task_title" varchar(180) NOT NULL,
	"task_type" varchar(60),
	"task_type_before" varchar(60),
	"task_due_date" timestamp with time zone NOT NULL,
	"minutes_since_due" integer NOT NULL,
	"was_completed" boolean NOT NULL,
	"push_delivered" boolean DEFAULT false NOT NULL,
	"push_sent" boolean DEFAULT false NOT NULL,
	"push_success_count" integer DEFAULT 0 NOT NULL,
	"push_failure_count" integer DEFAULT 0 NOT NULL,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"data_json" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_preferences" ADD CONSTRAINT "pet_preferences_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_ai_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proactive_messages" ADD CONSTRAINT "ai_proactive_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proactive_messages" ADD CONSTRAINT "ai_proactive_messages_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_session_id_ai_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_care_plans" ADD CONSTRAINT "pet_care_plans_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_pet_id_adoption_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."adoption_pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_pets" ADD CONSTRAINT "adoption_pets_shelter_id_adoption_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."adoption_shelters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_quiz_results" ADD CONSTRAINT "adoption_quiz_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD CONSTRAINT "vet_appointments_vet_id_vets_id_fk" FOREIGN KEY ("vet_id") REFERENCES "public"."vets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_appointments" ADD CONSTRAINT "vet_appointments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_availability" ADD CONSTRAINT "vet_availability_vet_id_vets_id_fk" FOREIGN KEY ("vet_id") REFERENCES "public"."vets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_appointment_id_vet_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."vet_appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_vet_id_vets_id_fk" FOREIGN KEY ("vet_id") REFERENCES "public"."vets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_reviews" ADD CONSTRAINT "vet_reviews_vet_id_vets_id_fk" FOREIGN KEY ("vet_id") REFERENCES "public"."vets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_reviews" ADD CONSTRAINT "vet_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_services" ADD CONSTRAINT "vet_services_vet_id_vets_id_fk" FOREIGN KEY ("vet_id") REFERENCES "public"."vets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_booking_reviews" ADD CONSTRAINT "service_booking_reviews_booking_id_service_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."service_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_booking_reviews" ADD CONSTRAINT "service_booking_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminder_logs" ADD CONSTRAINT "task_reminder_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reminder_logs" ADD CONSTRAINT "task_reminder_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_medical_records_pet_id" ON "medical_records" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_medical_records_date" ON "medical_records" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_pet_preferences_pet_id" ON "pet_preferences" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_pets_user_id" ON "pets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pets_type" ON "pets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_pets_microchip" ON "pets" USING btree ("microchip_id");--> statement-breakpoint
CREATE INDEX "idx_reminders_user_id" ON "reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reminders_pet_id" ON "reminders" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_reminders_active" ON "reminders" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_tasks_user_id" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_pet_id" ON "tasks" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_due_date" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_completed" ON "tasks" USING btree ("is_completed");--> statement-breakpoint
CREATE INDEX "idx_admin_instructions_target" ON "admin_ai_instructions" USING btree ("target_type","target_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_ai_messages_session" ON "ai_chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_ai_sessions_user" ON "ai_chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_sessions_pet" ON "ai_chat_sessions" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_proactive_user" ON "ai_proactive_messages" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_token_usage_user" ON "ai_token_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_token_usage_date" ON "ai_token_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_token_usage_model" ON "ai_token_usage" USING btree ("model_name","created_at");--> statement-breakpoint
CREATE INDEX "idx_care_plans_pet" ON "pet_care_plans" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_care_plans_active" ON "pet_care_plans" USING btree ("is_active","pet_id");--> statement-breakpoint
CREATE INDEX "idx_woo_products_cache_woo_id" ON "woo_products_cache" USING btree ("woo_product_id");--> statement-breakpoint
CREATE INDEX "idx_woo_products_cache_status" ON "woo_products_cache" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_woo_order_items_order_id" ON "woo_order_items_cache" USING btree ("woo_order_id");--> statement-breakpoint
CREATE INDEX "idx_woo_order_items_line_id" ON "woo_order_items_cache" USING btree ("woo_line_item_id");--> statement-breakpoint
CREATE INDEX "idx_woo_orders_cache_woo_id" ON "woo_orders_cache" USING btree ("woo_order_id");--> statement-breakpoint
CREATE INDEX "idx_woo_orders_cache_status" ON "woo_orders_cache" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_woo_customers_cache_woo_id" ON "woo_customers_cache" USING btree ("woo_customer_id");--> statement-breakpoint
CREATE INDEX "idx_sync_jobs_provider_status" ON "integration_sync_jobs" USING btree ("provider","status");--> statement-breakpoint
CREATE INDEX "idx_woo_webhook_delivery_id" ON "woo_webhook_events" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "idx_woo_webhook_event_type" ON "woo_webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_adoption_applications_pet_id" ON "adoption_applications" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_adoption_applications_user_id" ON "adoption_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_adoption_applications_status" ON "adoption_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_adoption_pets_status" ON "adoption_pets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_adoption_pets_type" ON "adoption_pets" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_adoption_quiz_user_id" ON "adoption_quiz_results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_adoption_shelters_name" ON "adoption_shelters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_vet_appointments_vet_id" ON "vet_appointments" USING btree ("vet_id");--> statement-breakpoint
CREATE INDEX "idx_vet_appointments_user_id" ON "vet_appointments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vet_appointments_status" ON "vet_appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vet_availability_vet_id" ON "vet_availability" USING btree ("vet_id");--> statement-breakpoint
CREATE INDEX "idx_vet_prescriptions_user_id" ON "vet_prescriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vet_prescriptions_vet_id" ON "vet_prescriptions" USING btree ("vet_id");--> statement-breakpoint
CREATE INDEX "idx_vet_reviews_vet_id" ON "vet_reviews" USING btree ("vet_id");--> statement-breakpoint
CREATE INDEX "idx_vet_reviews_user_id" ON "vet_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_vet_services_vet_id" ON "vet_services" USING btree ("vet_id");--> statement-breakpoint
CREATE INDEX "idx_vets_specialty" ON "vets" USING btree ("specialty");--> statement-breakpoint
CREATE INDEX "idx_vets_location" ON "vets" USING btree ("location");--> statement-breakpoint
CREATE INDEX "idx_service_booking_reviews_booking_id" ON "service_booking_reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_service_bookings_user_id" ON "service_bookings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_service_bookings_status" ON "service_bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_service_bookings_provider" ON "service_bookings" USING btree ("provider_type","provider_id");--> statement-breakpoint
CREATE INDEX "idx_sitters_location" ON "sitters" USING btree ("location");--> statement-breakpoint
CREATE INDEX "idx_walkers_location" ON "walkers" USING btree ("location");--> statement-breakpoint
CREATE INDEX "idx_trl_task_id" ON "task_reminder_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_trl_user_id" ON "task_reminder_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_trl_fired_at" ON "task_reminder_logs" USING btree ("fired_at");--> statement-breakpoint
CREATE INDEX "idx_trl_step" ON "task_reminder_logs" USING btree ("reminder_step");--> statement-breakpoint
CREATE INDEX "idx_trl_push_delivered" ON "task_reminder_logs" USING btree ("push_delivered");--> statement-breakpoint
CREATE INDEX "idx_un_user_id" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_un_user_read" ON "user_notifications" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_un_created_at" ON "user_notifications" USING btree ("created_at");