CREATE TABLE "ai_model_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_config_id" uuid NOT NULL,
	"stat_date" timestamp with time zone DEFAULT now() NOT NULL,
	"total_calls" integer DEFAULT 0,
	"total_tokens" integer DEFAULT 0,
	"total_cost_usd" numeric(10, 6) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_token_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_limit" integer,
	"monthly_limit" integer,
	"is_blocked" boolean DEFAULT false,
	"block_reason" text,
	"tokens_today" integer DEFAULT 0,
	"tokens_month" integer DEFAULT 0,
	"reset_day_at" timestamp with time zone DEFAULT now(),
	"reset_month_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
	"feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" numeric DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD COLUMN "display_name" varchar(100);--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD COLUMN "base_url" varchar(500);--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD COLUMN "max_tokens_per_user_day" integer;--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD COLUMN "token_reset_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "ai_model_daily_stats" ADD CONSTRAINT "ai_model_daily_stats_model_config_id_ai_model_configs_id_fk" FOREIGN KEY ("model_config_id") REFERENCES "public"."ai_model_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_token_limits" ADD CONSTRAINT "user_ai_token_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_subscription_plans_active" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_user_id" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_subscriptions_status" ON "user_subscriptions" USING btree ("status");