-- 013_sync_schema_to_code.sql
-- Brings the database up to the Drizzle schema of branch feat/food-inventory-phase4.
-- Additive and idempotent: no DROP, no type changes, safe to re-run.
-- Generated 2026-08-06 12:55 UTC

BEGIN;

-- ── new tables (59) ──
CREATE TABLE IF NOT EXISTS "addresses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "label" varchar(50),
  "full_name" varchar(120) NOT NULL,
  "phone" varchar(30) NOT NULL,
  "line1" text NOT NULL,
  "line2" text,
  "city" varchar(120) NOT NULL,
  "state" varchar(120),
  "postal_code" varchar(30),
  "country" varchar(120) DEFAULT 'Bangladesh' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "admin_ai_instructions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "ai_chat_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "ai_chat_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "pet_id" uuid,
  "title" varchar(200),
  "context_snapshot_json" text,
  "is_admin_session" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "ai_model_configs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "provider" varchar(50) NOT NULL,
  "model_name" varchar(100) NOT NULL,
  "display_name" varchar(100),
  "api_key_encrypted" text NOT NULL,
  "purpose" varchar(50) NOT NULL,
  "notes" text,
  "base_url" varchar(500),
  "is_active" boolean DEFAULT false,
  "max_tokens_per_day" integer,
  "max_tokens_per_user_day" integer,
  "tokens_used_today" integer DEFAULT 0,
  "token_reset_at" timestamp with time zone DEFAULT now(),
  "cost_per_1k_input" numeric(8, 4),
  "cost_per_1k_output" numeric(8, 4),
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "ai_model_daily_stats" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "model_config_id" uuid NOT NULL,
  "stat_date" timestamp with time zone DEFAULT now() NOT NULL,
  "total_calls" integer DEFAULT 0,
  "total_tokens" integer DEFAULT 0,
  "total_cost_usd" numeric(10, 6) DEFAULT '0',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "ai_proactive_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "ai_token_usage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "booking_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "booking_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "rating" integer NOT NULL,
  "comment" text,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "bookings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "job_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "schedule_at" timestamp,
  "status" varchar(20) DEFAULT 'scheduled' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "cart_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "description" varchar(500),
  "image_url" varchar(255),
  "parent_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "comment_likes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "comment_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "parent_id" uuid,
  "content" text NOT NULL,
  "like_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "earnings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "profile_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "platform_fee_pct" numeric(5, 2) DEFAULT '10',
  "platform_fee" numeric(10, 2) NOT NULL,
  "net_amount" numeric(10, 2) NOT NULL,
  "payout_status" varchar(20) DEFAULT 'pending' NOT NULL,
  "payout_ref" varchar(200),
  "paid_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "pet_id" uuid,
  "amount" numeric(10, 2) NOT NULL,
  "category" varchar(50) NOT NULL,
  "date" date NOT NULL,
  "description" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "follows" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "follower_id" uuid NOT NULL,
  "following_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "food_inventory" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "freelancer_accounts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "email" varchar(255) NOT NULL,
  "password_hash" varchar(255) NOT NULL,
  "display_name" varchar(100) NOT NULL,
  "phone" varchar(30),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "freelancer_profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "account_id" uuid NOT NULL,
  "bio" text,
  "location" varchar(200),
  "service_types" jsonb DEFAULT '[]'::jsonb,
  "avatar_url" varchar(500),
  "rating" numeric(3, 2) DEFAULT '0',
  "rating_count" integer DEFAULT 0 NOT NULL,
  "total_earnings" numeric(10, 2) DEFAULT '0',
  "is_verified" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "freelancer_services" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "profile_id" uuid NOT NULL,
  "service_type" varchar(50) NOT NULL,
  "title" varchar(200) NOT NULL,
  "description" text,
  "price" numeric(10, 2) NOT NULL,
  "billing_period" varchar(20) DEFAULT 'per_walk' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "moderation_status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "customer_id" uuid NOT NULL,
  "customer_email" varchar(255) NOT NULL,
  "pet_id" uuid NOT NULL,
  "pet_name" varchar(100),
  "profile_id" uuid NOT NULL,
  "service_id" uuid,
  "message" text,
  "proposed_schedule" varchar(500),
  "agreed_price" numeric(10, 2),
  "status" varchar(20) DEFAULT 'sent' NOT NULL,
  "mode" varchar(10) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "responded_at" timestamp,
  "completed_at" timestamp
);
CREATE TABLE IF NOT EXISTS "likes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "name" varchar(255) NOT NULL,
  "slug" varchar(255) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "original_name" varchar(255),
  "storage_key" varchar(500),
  "url" text NOT NULL,
  "mime_type" varchar(120) NOT NULL,
  "file_type" varchar(20) NOT NULL,
  "file_size" bigint DEFAULT 0 NOT NULL,
  "width" integer,
  "height" integer,
  "duration_seconds" integer,
  "alt_text" varchar(500),
  "caption" text,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "uploaded_by" uuid,
  "is_public" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS "media_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "media_id" uuid NOT NULL,
  "entity_type" varchar(80) NOT NULL,
  "entity_id" uuid NOT NULL,
  "field_name" varchar(80) DEFAULT 'default' NOT NULL,
  "usage_type" varchar(30) DEFAULT 'primary' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "actor_id" uuid,
  "type" varchar(50) NOT NULL,
  "message" varchar(500) NOT NULL,
  "post_id" uuid,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "order_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "order_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "product_name" varchar(200) NOT NULL,
  "quantity" integer NOT NULL,
  "price" numeric(10, 2) NOT NULL
);
CREATE TABLE IF NOT EXISTS "orders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "total_amount" numeric(10, 2) NOT NULL,
  "status" varchar(50) DEFAULT 'PENDING' NOT NULL,
  "shipping_address" varchar(500),
  "payment_method" varchar(30) DEFAULT 'COD' NOT NULL,
  "payment_status" varchar(30) DEFAULT 'PENDING' NOT NULL,
  "source" varchar(30) DEFAULT 'checkout' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pet_care_plans" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "pet_id" uuid NOT NULL,
  "version" integer DEFAULT 1,
  "plan_json" text NOT NULL,
  "generated_by" varchar(80) DEFAULT 'gemini-1.5-pro',
  "is_active" boolean DEFAULT true,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS "pet_facts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "pet_id" uuid NOT NULL,
  "category" varchar(40) DEFAULT 'other' NOT NULL,
  "fact" text NOT NULL,
  "source" varchar(20) DEFAULT 'chat' NOT NULL,
  "session_id" uuid,
  "confidence" numeric(3, 2) DEFAULT '1' NOT NULL,
  "superseded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "pet_profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "posts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "pet_id" uuid,
  "content" text,
  "image_url" varchar(500),
  "video_url" varchar(500),
  "like_count" integer DEFAULT 0 NOT NULL,
  "comment_count" integer DEFAULT 0 NOT NULL,
  "share_count" integer DEFAULT 0 NOT NULL,
  "is_reported" boolean DEFAULT false NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_attribute_assignments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "product_id" uuid NOT NULL,
  "attribute_id" uuid NOT NULL,
  "attribute_value_id" uuid,
  "raw_value" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_attribute_values" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "attribute_id" uuid NOT NULL,
  "value" varchar(120) NOT NULL,
  "label" varchar(120),
  "color" varchar(20),
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_attributes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "name" varchar(100) NOT NULL,
  "code" varchar(100),
  "slug" varchar(100) NOT NULL,
  "description" varchar(500),
  "input_type" varchar(30) DEFAULT 'select' NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "is_filterable" boolean DEFAULT false NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "is_variant" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_brands" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "description" varchar(500),
  "logo" varchar(255),
  "website" varchar(255),
  "email" varchar(160),
  "phone" varchar(40),
  "is_featured" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_inventory_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "product_id" uuid NOT NULL,
  "type" varchar(30) NOT NULL,
  "quantity" integer NOT NULL,
  "note" varchar(500),
  "actor" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_seo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "product_id" uuid NOT NULL,
  "slug" varchar(255),
  "meta_title" varchar(255),
  "meta_description" varchar(500),
  "meta_keywords" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_sources" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  "slug" varchar(120) NOT NULL,
  "source_type" varchar(30) DEFAULT 'supplier' NOT NULL,
  "contact_name" varchar(120),
  "email" varchar(160),
  "contact_phone" varchar(40),
  "address" varchar(255),
  "website" varchar(255),
  "tax_id" varchar(120),
  "notes" varchar(500),
  "extra" text,
  "is_preferred" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "product_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "frequency_days" integer NOT NULL,
  "next_order_date" date,
  "last_ordered_at" timestamp,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "products" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "category_id" uuid NOT NULL,
  "brand_id" uuid,
  "source_id" uuid,
  "name" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "sku" varchar(100),
  "brand" varchar(120),
  "description" varchar(4000),
  "short_description" varchar(500),
  "sub_category" varchar(120),
  "product_type" varchar(30) DEFAULT 'Simple',
  "status" varchar(30) DEFAULT 'Draft',
  "supplier" varchar(200),
  "source" varchar(200),
  "exclude_from_subscription" boolean DEFAULT false,
  "tags" text,
  "attributes" text,
  "variations" text,
  "gallery_images" text,
  "seo_slug" varchar(255),
  "meta_title" varchar(255),
  "meta_description" varchar(500),
  "meta_keywords" varchar(500),
  "price" numeric(10, 2) NOT NULL,
  "cost_price" numeric(10, 2) DEFAULT '0' NOT NULL,
  "compare_at_price" numeric(10, 2),
  "image_url" varchar(255),
  "stock" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "reorders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "post_id" uuid NOT NULL,
  "reporter_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp,
  "reviewed_by" uuid
);
CREATE TABLE IF NOT EXISTS "service_booking_reviews" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "booking_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "rating" varchar(10) NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "service_bookings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "shares" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "post_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "platform" varchar(20),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "sitters" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "full_name" varchar(180) NOT NULL,
  "bio" text,
  "location" varchar(180),
  "rating" varchar(10) DEFAULT '0',
  "daily_rate" varchar(40),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "stories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "pet_id" uuid,
  "image_url" varchar(500) NOT NULL,
  "caption" varchar(500),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);
CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "name" varchar(120) NOT NULL,
  "description" varchar(500),
  "price" numeric(10, 2) DEFAULT '0' NOT NULL,
  "billing_cycle" varchar(20) DEFAULT 'monthly' NOT NULL,
  "feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" numeric DEFAULT '0' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "ticket_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "sender_role" varchar(20) NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "raised_by" uuid NOT NULL,
  "raiser_role" varchar(20) NOT NULL,
  "subject" varchar(300) NOT NULL,
  "category" varchar(50) DEFAULT 'other' NOT NULL,
  "related_job_id" uuid,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "priority" varchar(20) DEFAULT 'medium' NOT NULL,
  "assigned_to" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "task_reminder_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "user_ai_token_limits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "type" varchar(40) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "data_json" text,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "user_subscriptions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "vaccinations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
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
CREATE TABLE IF NOT EXISTS "walkers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "full_name" varchar(180) NOT NULL,
  "bio" text,
  "location" varchar(180),
  "rating" varchar(10) DEFAULT '0',
  "hourly_rate" varchar(40),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "wishlist_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- ── missing columns on existing tables (9) ──
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "ai_analysis_json" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "frequency" varchar(40) DEFAULT 'none' NOT NULL;
ALTER TABLE "vet_appointments" ADD COLUMN IF NOT EXISTS "follow_up_at" varchar(40);
ALTER TABLE "vets" ADD COLUMN IF NOT EXISTS "email" varchar(180);
ALTER TABLE "vets" ADD COLUMN IF NOT EXISTS "phone" varchar(40);
ALTER TABLE "vets" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
ALTER TABLE "vets" ADD COLUMN IF NOT EXISTS "experience_years" integer DEFAULT 0 NOT NULL;
ALTER TABLE "vets" ADD COLUMN IF NOT EXISTS "qualifications_json" text;
ALTER TABLE "vets" ADD COLUMN IF NOT EXISTS "is_available" boolean DEFAULT true NOT NULL;

-- ── foreign keys (127) ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_user_id_fk') THEN
    ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk addresses_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adoption_applications_pet_id_fk') THEN
    ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "adoption_pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk adoption_applications_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adoption_applications_user_id_fk') THEN
    ALTER TABLE "adoption_applications" ADD CONSTRAINT "adoption_applications_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk adoption_applications_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adoption_pets_shelter_id_fk') THEN
    ALTER TABLE "adoption_pets" ADD CONSTRAINT "adoption_pets_shelter_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "adoption_shelters" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk adoption_pets_shelter_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'adoption_quiz_results_user_id_fk') THEN
    ALTER TABLE "adoption_quiz_results" ADD CONSTRAINT "adoption_quiz_results_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk adoption_quiz_results_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_messages_session_id_fk') THEN
    ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_chat_messages_session_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_user_id_fk') THEN
    ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_chat_sessions_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_chat_sessions_pet_id_fk') THEN
    ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_chat_sessions_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_model_daily_stats_model_config_id_fk') THEN
    ALTER TABLE "ai_model_daily_stats" ADD CONSTRAINT "ai_model_daily_stats_model_config_id_fk" FOREIGN KEY ("model_config_id") REFERENCES "ai_model_configs" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_model_daily_stats_model_config_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_proactive_messages_user_id_fk') THEN
    ALTER TABLE "ai_proactive_messages" ADD CONSTRAINT "ai_proactive_messages_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_proactive_messages_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_proactive_messages_pet_id_fk') THEN
    ALTER TABLE "ai_proactive_messages" ADD CONSTRAINT "ai_proactive_messages_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_proactive_messages_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_token_usage_user_id_fk') THEN
    ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_token_usage_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_token_usage_pet_id_fk') THEN
    ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_token_usage_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_token_usage_session_id_fk') THEN
    ALTER TABLE "ai_token_usage" ADD CONSTRAINT "ai_token_usage_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk ai_token_usage_session_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_tokens_user_id_fk') THEN
    ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk auth_tokens_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_reviews_booking_id_fk') THEN
    ALTER TABLE "booking_reviews" ADD CONSTRAINT "booking_reviews_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk booking_reviews_booking_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_reviews_customer_id_fk') THEN
    ALTER TABLE "booking_reviews" ADD CONSTRAINT "booking_reviews_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "users" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk booking_reviews_customer_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_reviews_profile_id_fk') THEN
    ALTER TABLE "booking_reviews" ADD CONSTRAINT "booking_reviews_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk booking_reviews_profile_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_job_id_fk') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk bookings_job_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_customer_id_fk') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "users" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk bookings_customer_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_profile_id_fk') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk bookings_profile_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_post_id_fk') THEN
    ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk bookmarks_post_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookmarks_user_id_fk') THEN
    ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk bookmarks_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_user_id_fk') THEN
    ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk cart_items_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_product_id_fk') THEN
    ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "products" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk cart_items_product_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_id_fk') THEN
    ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk categories_parent_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_likes_comment_id_fk') THEN
    ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk comment_likes_comment_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_likes_user_id_fk') THEN
    ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk comment_likes_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_post_id_fk') THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk comments_post_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_user_id_fk') THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk comments_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_id_fk') THEN
    ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "comments" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk comments_parent_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'device_tokens_user_id_fk') THEN
    ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk device_tokens_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'earnings_profile_id_fk') THEN
    ALTER TABLE "earnings" ADD CONSTRAINT "earnings_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk earnings_profile_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'earnings_job_id_fk') THEN
    ALTER TABLE "earnings" ADD CONSTRAINT "earnings_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk earnings_job_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_user_id_fk') THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk expenses_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_pet_id_fk') THEN
    ALTER TABLE "expenses" ADD CONSTRAINT "expenses_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk expenses_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follows_follower_id_fk') THEN
    ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fk" FOREIGN KEY ("follower_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk follows_follower_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'follows_following_id_fk') THEN
    ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_fk" FOREIGN KEY ("following_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk follows_following_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_inventory_pet_id_fk') THEN
    ALTER TABLE "food_inventory" ADD CONSTRAINT "food_inventory_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk food_inventory_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_inventory_user_id_fk') THEN
    ALTER TABLE "food_inventory" ADD CONSTRAINT "food_inventory_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk food_inventory_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'freelancer_profiles_account_id_fk') THEN
    ALTER TABLE "freelancer_profiles" ADD CONSTRAINT "freelancer_profiles_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "freelancer_accounts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk freelancer_profiles_account_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'freelancer_services_profile_id_fk') THEN
    ALTER TABLE "freelancer_services" ADD CONSTRAINT "freelancer_services_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk freelancer_services_profile_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_customer_id_fk') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "users" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk jobs_customer_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_pet_id_fk') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk jobs_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_profile_id_fk') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "freelancer_profiles" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk jobs_profile_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_service_id_fk') THEN
    ALTER TABLE "jobs" ADD CONSTRAINT "jobs_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "freelancer_services" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk jobs_service_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'likes_post_id_fk') THEN
    ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk likes_post_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'likes_user_id_fk') THEN
    ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk likes_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_uploaded_by_fk') THEN
    ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fk" FOREIGN KEY ("uploaded_by") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk media_assets_uploaded_by_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_links_media_id_fk') THEN
    ALTER TABLE "media_links" ADD CONSTRAINT "media_links_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "media_assets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk media_links_media_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_links_created_by_fk') THEN
    ALTER TABLE "media_links" ADD CONSTRAINT "media_links_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk media_links_created_by_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medical_records_pet_id_fk') THEN
    ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk medical_records_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_logs_created_by_fk') THEN
    ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk notification_logs_created_by_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk notifications_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_actor_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk notifications_actor_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_post_id_fk') THEN
    ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk notifications_post_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fk') THEN
    ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk order_items_order_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_user_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk orders_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_care_plans_pet_id_fk') THEN
    ALTER TABLE "pet_care_plans" ADD CONSTRAINT "pet_care_plans_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk pet_care_plans_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_facts_pet_id_fk') THEN
    ALTER TABLE "pet_facts" ADD CONSTRAINT "pet_facts_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk pet_facts_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_facts_session_id_fk') THEN
    ALTER TABLE "pet_facts" ADD CONSTRAINT "pet_facts_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk pet_facts_session_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_preferences_pet_id_fk') THEN
    ALTER TABLE "pet_preferences" ADD CONSTRAINT "pet_preferences_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk pet_preferences_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pet_profiles_pet_id_fk') THEN
    ALTER TABLE "pet_profiles" ADD CONSTRAINT "pet_profiles_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk pet_profiles_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pets_user_id_fk') THEN
    ALTER TABLE "pets" ADD CONSTRAINT "pets_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk pets_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_user_id_fk') THEN
    ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk posts_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posts_pet_id_fk') THEN
    ALTER TABLE "posts" ADD CONSTRAINT "posts_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk posts_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_attribute_assignments_product_id_fk') THEN
    ALTER TABLE "product_attribute_assignments" ADD CONSTRAINT "product_attribute_assignments_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "products" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_attribute_assignments_product_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_attribute_assignments_attribute_id_fk') THEN
    ALTER TABLE "product_attribute_assignments" ADD CONSTRAINT "product_attribute_assignments_attribute_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_attribute_assignments_attribute_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_attribute_assignments_attribute_value_id_fk') THEN
    ALTER TABLE "product_attribute_assignments" ADD CONSTRAINT "product_attribute_assignments_attribute_value_id_fk" FOREIGN KEY ("attribute_value_id") REFERENCES "product_attribute_values" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_attribute_assignments_attribute_value_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_attribute_values_attribute_id_fk') THEN
    ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "product_attributes" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_attribute_values_attribute_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_inventory_logs_product_id_fk') THEN
    ALTER TABLE "product_inventory_logs" ADD CONSTRAINT "product_inventory_logs_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "products" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_inventory_logs_product_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_seo_product_id_fk') THEN
    ALTER TABLE "product_seo" ADD CONSTRAINT "product_seo_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "products" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_seo_product_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_subscriptions_user_id_fk') THEN
    ALTER TABLE "product_subscriptions" ADD CONSTRAINT "product_subscriptions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_subscriptions_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_subscriptions_product_id_fk') THEN
    ALTER TABLE "product_subscriptions" ADD CONSTRAINT "product_subscriptions_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "products" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk product_subscriptions_product_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fk') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk products_category_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_brand_id_fk') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "product_brands" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk products_brand_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_source_id_fk') THEN
    ALTER TABLE "products" ADD CONSTRAINT "products_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "product_sources" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk products_source_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_user_id_fk') THEN
    ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reminders_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reminders_pet_id_fk') THEN
    ALTER TABLE "reminders" ADD CONSTRAINT "reminders_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reminders_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reorders_user_id_fk') THEN
    ALTER TABLE "reorders" ADD CONSTRAINT "reorders_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reorders_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reorders_pet_id_fk') THEN
    ALTER TABLE "reorders" ADD CONSTRAINT "reorders_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reorders_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reorders_inventory_id_fk') THEN
    ALTER TABLE "reorders" ADD CONSTRAINT "reorders_inventory_id_fk" FOREIGN KEY ("inventory_id") REFERENCES "food_inventory" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reorders_inventory_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_post_id_fk') THEN
    ALTER TABLE "reports" ADD CONSTRAINT "reports_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reports_post_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_reporter_id_fk') THEN
    ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reports_reporter_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reports_reviewed_by_fk') THEN
    ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk reports_reviewed_by_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_id_fk') THEN
    ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk role_permissions_role_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_permission_id_fk') THEN
    ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk role_permissions_permission_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_id_fk') THEN
    ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk role_permissions_role_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_permission_id_fk') THEN
    ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "permissions" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk role_permissions_permission_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_booking_reviews_booking_id_fk') THEN
    ALTER TABLE "service_booking_reviews" ADD CONSTRAINT "service_booking_reviews_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "service_bookings" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk service_booking_reviews_booking_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_booking_reviews_user_id_fk') THEN
    ALTER TABLE "service_booking_reviews" ADD CONSTRAINT "service_booking_reviews_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk service_booking_reviews_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_bookings_user_id_fk') THEN
    ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk service_bookings_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk sessions_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk sessions_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shares_post_id_fk') THEN
    ALTER TABLE "shares" ADD CONSTRAINT "shares_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "posts" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk shares_post_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shares_user_id_fk') THEN
    ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk shares_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_user_id_fk') THEN
    ALTER TABLE "stories" ADD CONSTRAINT "stories_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk stories_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stories_pet_id_fk') THEN
    ALTER TABLE "stories" ADD CONSTRAINT "stories_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk stories_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_ticket_id_fk') THEN
    ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk support_messages_ticket_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_related_job_id_fk') THEN
    ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_related_job_id_fk" FOREIGN KEY ("related_job_id") REFERENCES "jobs" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk support_tickets_related_job_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_reminder_logs_task_id_fk') THEN
    ALTER TABLE "task_reminder_logs" ADD CONSTRAINT "task_reminder_logs_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk task_reminder_logs_task_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_reminder_logs_user_id_fk') THEN
    ALTER TABLE "task_reminder_logs" ADD CONSTRAINT "task_reminder_logs_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk task_reminder_logs_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_user_id_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk tasks_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_pet_id_fk') THEN
    ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk tasks_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_ai_token_limits_user_id_fk') THEN
    ALTER TABLE "user_ai_token_limits" ADD CONSTRAINT "user_ai_token_limits_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_ai_token_limits_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_notifications_user_id_fk') THEN
    ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_notifications_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_roles_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_id_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_roles_role_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_assigned_by_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_roles_assigned_by_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_roles_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_role_id_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_roles_role_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_assigned_by_fk') THEN
    ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "users" ("id") ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_roles_assigned_by_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_subscriptions_user_id_fk') THEN
    ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_subscriptions_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_subscriptions_plan_id_fk') THEN
    ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans" ("id") ON DELETE RESTRICT;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk user_subscriptions_plan_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaccinations_pet_id_fk') THEN
    ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_pet_id_fk" FOREIGN KEY ("pet_id") REFERENCES "pets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vaccinations_pet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vaccinations_user_id_fk') THEN
    ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vaccinations_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_appointments_vet_id_fk') THEN
    ALTER TABLE "vet_appointments" ADD CONSTRAINT "vet_appointments_vet_id_fk" FOREIGN KEY ("vet_id") REFERENCES "vets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_appointments_vet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_appointments_user_id_fk') THEN
    ALTER TABLE "vet_appointments" ADD CONSTRAINT "vet_appointments_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_appointments_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_availability_vet_id_fk') THEN
    ALTER TABLE "vet_availability" ADD CONSTRAINT "vet_availability_vet_id_fk" FOREIGN KEY ("vet_id") REFERENCES "vets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_availability_vet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_prescriptions_appointment_id_fk') THEN
    ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_appointment_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "vet_appointments" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_prescriptions_appointment_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_prescriptions_user_id_fk') THEN
    ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_prescriptions_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_prescriptions_vet_id_fk') THEN
    ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_vet_id_fk" FOREIGN KEY ("vet_id") REFERENCES "vets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_prescriptions_vet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_reviews_vet_id_fk') THEN
    ALTER TABLE "vet_reviews" ADD CONSTRAINT "vet_reviews_vet_id_fk" FOREIGN KEY ("vet_id") REFERENCES "vets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_reviews_vet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_reviews_user_id_fk') THEN
    ALTER TABLE "vet_reviews" ADD CONSTRAINT "vet_reviews_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_reviews_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vet_services_vet_id_fk') THEN
    ALTER TABLE "vet_services" ADD CONSTRAINT "vet_services_vet_id_fk" FOREIGN KEY ("vet_id") REFERENCES "vets" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk vet_services_vet_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_items_user_id_fk') THEN
    ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk wishlist_items_user_id_fk: %', SQLERRM;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wishlist_items_product_id_fk') THEN
    ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "products" ("id");
  END IF;
EXCEPTION WHEN others THEN RAISE NOTICE 'skip fk wishlist_items_product_id_fk: %', SQLERRM;
END $$;

-- ── indexes (131) ──
CREATE INDEX IF NOT EXISTS "idx_addresses_user_id" ON "addresses" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_admin_instructions_target" ON "admin_ai_instructions" ("target_type", "target_id", "is_active");
CREATE INDEX IF NOT EXISTS "idx_adoption_applications_pet_id" ON "adoption_applications" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_adoption_applications_user_id" ON "adoption_applications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_adoption_applications_status" ON "adoption_applications" ("status");
CREATE INDEX IF NOT EXISTS "idx_adoption_pets_status" ON "adoption_pets" ("status");
CREATE INDEX IF NOT EXISTS "idx_adoption_pets_type" ON "adoption_pets" ("type");
CREATE INDEX IF NOT EXISTS "idx_adoption_quiz_user_id" ON "adoption_quiz_results" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_adoption_shelters_name" ON "adoption_shelters" ("name");
CREATE INDEX IF NOT EXISTS "idx_ai_messages_session" ON "ai_chat_messages" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_ai_sessions_user" ON "ai_chat_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_ai_sessions_pet" ON "ai_chat_sessions" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_proactive_user" ON "ai_proactive_messages" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_token_usage_user" ON "ai_token_usage" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_token_usage_date" ON "ai_token_usage" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_token_usage_model" ON "ai_token_usage" ("model_name", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "auth_tokens_token_unique" ON "auth_tokens" ("token");
CREATE INDEX IF NOT EXISTS "idx_auth_tokens_user_id" ON "auth_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_auth_tokens_type" ON "auth_tokens" ("type");
CREATE INDEX IF NOT EXISTS "idx_auth_tokens_expires_at" ON "auth_tokens" ("expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "bookmarks_post_user_uniq" ON "bookmarks" ("post_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_cart_items_user_id" ON "cart_items" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "comment_likes_comment_user_uniq" ON "comment_likes" ("comment_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_comments_post_id" ON "comments" ("post_id");
CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_fcm_token_unique" ON "device_tokens" ("fcm_token");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_id" ON "device_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_device_tokens_is_active" ON "device_tokens" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_expenses_user_date" ON "expenses" ("user_id", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "follows_follower_following_uniq" ON "follows" ("follower_id", "following_id");
CREATE INDEX IF NOT EXISTS "idx_follows_following_id" ON "follows" ("following_id");
CREATE INDEX IF NOT EXISTS "idx_food_inventory_pet_id" ON "food_inventory" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_food_inventory_user_id" ON "food_inventory" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_freelancer_services_type" ON "freelancer_services" ("service_type", "moderation_status");
CREATE INDEX IF NOT EXISTS "idx_sync_jobs_provider_status" ON "integration_sync_jobs" ("provider", "status");
CREATE INDEX IF NOT EXISTS "idx_jobs_customer_id" ON "jobs" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_jobs_profile_status" ON "jobs" ("profile_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "likes_post_user_uniq" ON "likes" ("post_id", "user_id");
CREATE INDEX IF NOT EXISTS "idx_media_assets_type" ON "media_assets" ("file_type");
CREATE INDEX IF NOT EXISTS "idx_media_assets_active" ON "media_assets" ("is_active", "deleted_at");
CREATE UNIQUE INDEX IF NOT EXISTS "media_links_media_entity_field_uniq" ON "media_links" ("media_id", "entity_type", "entity_id", "field_name");
CREATE INDEX IF NOT EXISTS "idx_media_links_entity" ON "media_links" ("entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "idx_media_links_media_id" ON "media_links" ("media_id");
CREATE INDEX IF NOT EXISTS "idx_medical_records_pet_id" ON "medical_records" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_medical_records_date" ON "medical_records" ("date");
CREATE INDEX IF NOT EXISTS "idx_notification_logs_type" ON "notification_logs" ("type");
CREATE INDEX IF NOT EXISTS "idx_notification_logs_status" ON "notification_logs" ("status");
CREATE INDEX IF NOT EXISTS "idx_notification_logs_created_at" ON "notification_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_social_notifications_user_read" ON "notifications" ("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "idx_orders_user_id" ON "orders" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_orders_status_created" ON "orders" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_care_plans_pet" ON "pet_care_plans" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_care_plans_active" ON "pet_care_plans" ("is_active", "pet_id");
CREATE INDEX IF NOT EXISTS "idx_pet_facts_pet_id" ON "pet_facts" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_pet_facts_category" ON "pet_facts" ("category");
CREATE INDEX IF NOT EXISTS "idx_pet_preferences_pet_id" ON "pet_preferences" ("pet_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pet_profiles_pet_id" ON "pet_profiles" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_pets_user_id" ON "pets" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_pets_type" ON "pets" ("type");
CREATE INDEX IF NOT EXISTS "idx_pets_microchip" ON "pets" ("microchip_id");
CREATE INDEX IF NOT EXISTS "idx_posts_user_id" ON "posts" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_posts_status_created" ON "posts" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "idx_product_subscriptions_due" ON "product_subscriptions" ("is_active", "next_order_date");
CREATE INDEX IF NOT EXISTS "idx_products_category_id" ON "products" ("category_id");
CREATE INDEX IF NOT EXISTS "idx_products_status_active" ON "products" ("status", "is_active");
CREATE INDEX IF NOT EXISTS "idx_reminders_user_id" ON "reminders" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_reminders_pet_id" ON "reminders" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_reminders_active" ON "reminders" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_reorders_user_id" ON "reorders" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_reorders_status" ON "reorders" ("status");
CREATE INDEX IF NOT EXISTS "idx_reports_status" ON "reports" ("status");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_role_id" ON "role_permissions" ("role_id");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_permission_id" ON "role_permissions" ("permission_id");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_role_id" ON "role_permissions" ("role_id");
CREATE INDEX IF NOT EXISTS "idx_role_permissions_permission_id" ON "role_permissions" ("permission_id");
CREATE INDEX IF NOT EXISTS "idx_service_booking_reviews_booking_id" ON "service_booking_reviews" ("booking_id");
CREATE INDEX IF NOT EXISTS "idx_service_bookings_user_id" ON "service_bookings" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_service_bookings_status" ON "service_bookings" ("status");
CREATE INDEX IF NOT EXISTS "idx_service_bookings_provider" ON "service_bookings" ("provider_type", "provider_id");
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_sessions_revoked_at" ON "sessions" ("revoked_at");
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_sessions_expires_at" ON "sessions" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_sessions_revoked_at" ON "sessions" ("revoked_at");
CREATE INDEX IF NOT EXISTS "idx_sitters_location" ON "sitters" ("location");
CREATE INDEX IF NOT EXISTS "idx_stories_expires_at" ON "stories" ("expires_at");
CREATE INDEX IF NOT EXISTS "idx_subscription_plans_active" ON "subscription_plans" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_support_tickets_status" ON "support_tickets" ("status", "priority");
CREATE INDEX IF NOT EXISTS "idx_trl_task_id" ON "task_reminder_logs" ("task_id");
CREATE INDEX IF NOT EXISTS "idx_trl_user_id" ON "task_reminder_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_trl_fired_at" ON "task_reminder_logs" ("fired_at");
CREATE INDEX IF NOT EXISTS "idx_trl_step" ON "task_reminder_logs" ("reminder_step");
CREATE INDEX IF NOT EXISTS "idx_trl_push_delivered" ON "task_reminder_logs" ("push_delivered");
CREATE INDEX IF NOT EXISTS "idx_tasks_user_id" ON "tasks" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_pet_id" ON "tasks" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_due_date" ON "tasks" ("due_date");
CREATE INDEX IF NOT EXISTS "idx_tasks_completed" ON "tasks" ("is_completed");
CREATE INDEX IF NOT EXISTS "idx_un_user_id" ON "user_notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_un_user_read" ON "user_notifications" ("user_id", "is_read");
CREATE INDEX IF NOT EXISTS "idx_un_created_at" ON "user_notifications" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "user_roles" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_role_id" ON "user_roles" ("role_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_user_id" ON "user_roles" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_roles_role_id" ON "user_roles" ("role_id");
CREATE INDEX IF NOT EXISTS "idx_user_subscriptions_user_id" ON "user_subscriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_user_subscriptions_status" ON "user_subscriptions" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_unique" ON "users" ("firebase_uid");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "users_firebase_uid_unique" ON "users" ("firebase_uid");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" ("email");
CREATE INDEX IF NOT EXISTS "idx_users_status" ON "users" ("status");
CREATE INDEX IF NOT EXISTS "idx_vaccinations_pet_id" ON "vaccinations" ("pet_id");
CREATE INDEX IF NOT EXISTS "idx_vaccinations_user_id" ON "vaccinations" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_vaccinations_status" ON "vaccinations" ("status");
CREATE INDEX IF NOT EXISTS "idx_vet_appointments_vet_id" ON "vet_appointments" ("vet_id");
CREATE INDEX IF NOT EXISTS "idx_vet_appointments_user_id" ON "vet_appointments" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_vet_appointments_status" ON "vet_appointments" ("status");
CREATE INDEX IF NOT EXISTS "idx_vet_availability_vet_id" ON "vet_availability" ("vet_id");
CREATE INDEX IF NOT EXISTS "idx_vet_prescriptions_user_id" ON "vet_prescriptions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_vet_prescriptions_vet_id" ON "vet_prescriptions" ("vet_id");
CREATE INDEX IF NOT EXISTS "idx_vet_reviews_vet_id" ON "vet_reviews" ("vet_id");
CREATE INDEX IF NOT EXISTS "idx_vet_reviews_user_id" ON "vet_reviews" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_vet_services_vet_id" ON "vet_services" ("vet_id");
CREATE INDEX IF NOT EXISTS "idx_vets_specialty" ON "vets" ("specialty");
CREATE INDEX IF NOT EXISTS "idx_vets_location" ON "vets" ("location");
CREATE INDEX IF NOT EXISTS "idx_vets_status" ON "vets" ("status");
CREATE INDEX IF NOT EXISTS "idx_walkers_location" ON "walkers" ("location");
CREATE INDEX IF NOT EXISTS "idx_wishlist_items_user_id" ON "wishlist_items" ("user_id");

COMMIT;
