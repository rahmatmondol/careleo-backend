CREATE TABLE "food_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" varchar(200),
	"quantity_units" numeric(12, 2) DEFAULT '0' NOT NULL,
	"daily_consumption" numeric(12, 2) DEFAULT '0' NOT NULL,
	"low_stock_threshold_days" integer DEFAULT 3 NOT NULL,
	"last_reordered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reorders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pet_id" uuid,
	"inventory_id" uuid,
	"product_id" uuid,
	"product_name" varchar(200),
	"quantity" integer DEFAULT 1 NOT NULL,
	"mode" varchar(20) DEFAULT 'assisted' NOT NULL,
	"status" varchar(20) DEFAULT 'pending_confirm' NOT NULL,
	"shop_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "food_inventory" ADD CONSTRAINT "food_inventory_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_inventory" ADD CONSTRAINT "food_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorders" ADD CONSTRAINT "reorders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorders" ADD CONSTRAINT "reorders_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reorders" ADD CONSTRAINT "reorders_inventory_id_food_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "public"."food_inventory"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_food_inventory_pet_id" ON "food_inventory" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "idx_food_inventory_user_id" ON "food_inventory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reorders_user_id" ON "reorders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reorders_status" ON "reorders" USING btree ("status");