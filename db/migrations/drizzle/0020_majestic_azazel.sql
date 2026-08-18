CREATE TABLE "abandoned_cart_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cart_signature" varchar(120) NOT NULL,
	"cart_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recovered_order_id" uuid,
	"recovered_amount" numeric(10, 2),
	"recovered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "abandoned_cart_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"trigger_time_hours" integer DEFAULT 24 NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"template_subject" varchar(200) DEFAULT '' NOT NULL,
	"template_body" varchar(2000) DEFAULT '' NOT NULL,
	"offer_coupon_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"order_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(60) NOT NULL,
	"type" varchar(20) NOT NULL,
	"value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"min_purchase_amount" numeric(10, 2),
	"max_discount_amount" numeric(10, 2),
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"per_user_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"applicable_product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_code" varchar(60);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "abandoned_cart_events" ADD CONSTRAINT "abandoned_cart_events_rule_id_abandoned_cart_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."abandoned_cart_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_cart_events" ADD CONSTRAINT "abandoned_cart_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_cart_events" ADD CONSTRAINT "abandoned_cart_events_recovered_order_id_orders_id_fk" FOREIGN KEY ("recovered_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abandoned_cart_rules" ADD CONSTRAINT "abandoned_cart_rules_offer_coupon_id_coupons_id_fk" FOREIGN KEY ("offer_coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_abandoned_cart_events_rule_user_cart" ON "abandoned_cart_events" USING btree ("rule_id","user_id","cart_signature");--> statement-breakpoint
CREATE INDEX "idx_abandoned_cart_events_rule" ON "abandoned_cart_events" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "idx_abandoned_cart_events_user_sent" ON "abandoned_cart_events" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "idx_abandoned_cart_rules_active" ON "abandoned_cart_rules" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coupon_redemptions_order" ON "coupon_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_coupon_redemptions_coupon" ON "coupon_redemptions" USING btree ("coupon_id");--> statement-breakpoint
CREATE INDEX "idx_coupon_redemptions_user" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_coupons_code" ON "coupons" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_coupons_active" ON "coupons" USING btree ("is_active");