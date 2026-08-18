CREATE TABLE "revenuecat_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(120) NOT NULL,
	"type" varchar(40) NOT NULL,
	"app_user_id" varchar(190),
	"user_id" uuid,
	"product_id" varchar(190),
	"store" varchar(40),
	"environment" varchar(20),
	"event_timestamp_ms" numeric,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "rc_entitlement_id" varchar(190);--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "rc_product_id_ios" varchar(190);--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "rc_product_id_android" varchar(190);--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD COLUMN "rc_product_id_web" varchar(190);--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "provider" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "store" varchar(40);--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "rc_app_user_id" varchar(190);--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "rc_entitlement_id" varchar(190);--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "rc_product_id" varchar(190);--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "rc_original_transaction_id" varchar(190);--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "will_renew" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "last_event_at_ms" numeric;--> statement-breakpoint
ALTER TABLE "revenuecat_events" ADD CONSTRAINT "revenuecat_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_revenuecat_events_event_id" ON "revenuecat_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_revenuecat_events_user" ON "revenuecat_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_revenuecat_events_created" ON "revenuecat_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_rc_entitlement" ON "subscription_plans" USING btree ("rc_entitlement_id");