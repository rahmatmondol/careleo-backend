CREATE TABLE "plan_coverage_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"scope" varchar(20) NOT NULL,
	"ref_id" uuid NOT NULL,
	"monthly_qty_limit" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_benefit_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone,
	"amount_used" numeric(10, 2) DEFAULT '0' NOT NULL,
	"qty_used_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "covered_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "covered_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "covered_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payable_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "benefit_period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coverage_meta_json" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_coverage_rules" ADD CONSTRAINT "plan_coverage_rules_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_benefit_usage" ADD CONSTRAINT "subscription_benefit_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_plan_coverage_rules_plan" ON "plan_coverage_rules" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plan_coverage_rules_plan_scope_ref" ON "plan_coverage_rules" USING btree ("plan_id","scope","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscription_benefit_usage_user_period" ON "subscription_benefit_usage" USING btree ("user_id","period_start");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE set null ON UPDATE no action;