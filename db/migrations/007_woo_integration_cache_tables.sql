-- WooCommerce integration cache + webhook reliability tables

CREATE TABLE IF NOT EXISTS woo_products_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_product_id INTEGER NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  status VARCHAR(40),
  type VARCHAR(40),
  price NUMERIC(12,2),
  regular_price NUMERIC(12,2),
  sale_price NUMERIC(12,2),
  stock_status VARCHAR(40),
  image_url TEXT,
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_woo_products_cache_woo_id ON woo_products_cache(woo_product_id);
CREATE INDEX IF NOT EXISTS idx_woo_products_cache_status ON woo_products_cache(status);

CREATE TABLE IF NOT EXISTS woo_orders_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id INTEGER NOT NULL UNIQUE,
  order_key VARCHAR(120),
  status VARCHAR(40) NOT NULL,
  currency VARCHAR(10),
  total VARCHAR(40),
  customer_id INTEGER,
  billing_email VARCHAR(255),
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_woo_orders_cache_woo_id ON woo_orders_cache(woo_order_id);
CREATE INDEX IF NOT EXISTS idx_woo_orders_cache_status ON woo_orders_cache(status);

CREATE TABLE IF NOT EXISTS woo_order_items_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_order_id INTEGER NOT NULL,
  woo_line_item_id INTEGER NOT NULL,
  product_id INTEGER,
  variation_id INTEGER,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total VARCHAR(40),
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (woo_order_id, woo_line_item_id)
);
CREATE INDEX IF NOT EXISTS idx_woo_order_items_order_id ON woo_order_items_cache(woo_order_id);
CREATE INDEX IF NOT EXISTS idx_woo_order_items_line_id ON woo_order_items_cache(woo_line_item_id);

CREATE TABLE IF NOT EXISTS woo_customers_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  woo_customer_id INTEGER NOT NULL UNIQUE,
  email VARCHAR(255),
  first_name VARCHAR(120),
  last_name VARCHAR(120),
  role VARCHAR(80),
  payload JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_woo_customers_cache_woo_id ON woo_customers_cache(woo_customer_id);

CREATE TABLE IF NOT EXISTS woo_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(80) NOT NULL,
  webhook_id VARCHAR(120),
  resource_id INTEGER,
  delivery_id VARCHAR(120) NOT NULL,
  signature TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (delivery_id)
);
CREATE INDEX IF NOT EXISTS idx_woo_webhook_delivery_id ON woo_webhook_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_woo_webhook_event_type ON woo_webhook_events(event_type);

CREATE TABLE IF NOT EXISTS integration_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(40) NOT NULL,
  job_type VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  meta JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_provider_status ON integration_sync_jobs(provider, status);
