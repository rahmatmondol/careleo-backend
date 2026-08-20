ALTER TABLE "ai_model_daily_stats" ALTER COLUMN "stat_date" SET DATA TYPE date;--> statement-breakpoint
ALTER TABLE "ai_model_daily_stats" ALTER COLUMN "stat_date" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "ai_model_daily_stats" ADD CONSTRAINT "uq_ai_model_daily_stats_model_date" UNIQUE("model_config_id","stat_date");--> statement-breakpoint
ALTER TABLE "user_ai_token_limits" ADD CONSTRAINT "user_ai_token_limits_user_id_unique" UNIQUE("user_id");