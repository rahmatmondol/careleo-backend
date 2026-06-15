import { sql } from './client';

export const ensureSchema = async () => {
  await sql`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`;

  await sql`
    CREATE TABLE IF NOT EXISTS media_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255),
      storage_key VARCHAR(500),
      url TEXT NOT NULL,
      mime_type VARCHAR(120) NOT NULL,
      file_type VARCHAR(20) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      duration_seconds INTEGER,
      alt_text VARCHAR(500),
      caption TEXT,
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      uploaded_by UUID,
      is_public BOOLEAN NOT NULL DEFAULT true,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS media_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      media_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      entity_type VARCHAR(80) NOT NULL,
      entity_id UUID NOT NULL,
      field_name VARCHAR(80) NOT NULL DEFAULT 'default',
      usage_type VARCHAR(30) NOT NULL DEFAULT 'primary',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(media_id, entity_type, entity_id, field_name)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_media_assets_type ON media_assets(file_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_assets_active ON media_assets(is_active, deleted_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_links_entity ON media_links(entity_type, entity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_media_links_media_id ON media_links(media_id)`;
};
