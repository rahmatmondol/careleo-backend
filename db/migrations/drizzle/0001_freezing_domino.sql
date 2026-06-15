CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(191) NOT NULL,
	"type" varchar(40) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"fcm_token" text NOT NULL,
	"platform" varchar(20) NOT NULL,
	"app_version" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"data_json" text,
	"target_mode" varchar(20) NOT NULL,
	"target_user_ids" text,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "firebase_uid" varchar(191);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "city" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "state" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "country" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "postal_code" varchar(40);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "provider" varchar(20) DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_unique" ON "auth_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_user_id" ON "auth_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_type" ON "auth_tokens" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_auth_tokens_expires_at" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_fcm_token_unique" ON "device_tokens" USING btree ("fcm_token");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_user_id" ON "device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_device_tokens_is_active" ON "device_tokens" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_type" ON "notification_logs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_status" ON "notification_logs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notification_logs_created_at" ON "notification_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_firebase_uid_unique" ON "users" USING btree ("firebase_uid");