import { sql } from '@/shared/db/sql';
import { toSlug } from '../utils/text';
import { mediaStorage } from '../storage';
import { guessFileType } from '../utils/file';
import { mapAsset } from './media.read';

export async function createAsset(body: any, userId?: string) {
  const cleanedName = String(body.name || body.originalName || body.fileName || '').trim();
  const baseSlug = toSlug(cleanedName);
  const exists = await sql`SELECT slug FROM media_assets WHERE slug = ${baseSlug} LIMIT 1`;
  const finalSlug = exists.length ? `${baseSlug}-${Date.now()}` : baseSlug;

  const inserted = await sql`
    INSERT INTO media_assets (
      name, slug, file_name, original_name, storage_key, url, mime_type, file_type,
      file_size, width, height, duration_seconds, alt_text, caption, description,
      metadata, uploaded_by, is_public, is_active
    ) VALUES (
      ${cleanedName}, ${finalSlug}, ${String(body.fileName || cleanedName)}, ${body.originalName || null}, ${body.storageKey || null}, ${String(body.url || '')},
      ${String(body.mimeType || 'application/octet-stream')}, ${String(body.fileType || 'file')},
      ${Number(body.fileSize || 0)}, ${body.width ?? null}, ${body.height ?? null}, ${body.durationSeconds ?? null},
      ${body.altText || null}, ${body.caption || null}, ${body.description || null},
      ${JSON.stringify(body.metadata || {})}::jsonb, ${userId || null}, ${body.isPublic !== false}, ${body.isActive !== false}
    ) RETURNING *
  `;

  return mapAsset(inserted[0]);
}

export async function uploadAndCreateAsset(input: {
  file: File;
  folder?: string;
  name?: string;
  altText?: string;
  caption?: string;
  description?: string;
  metadata?: any;
  isPublic?: boolean;
  isActive?: boolean;
}, userId?: string) {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const mimeType = input.file.type || 'application/octet-stream';
  const uploaded = await mediaStorage.upload({
    bytes,
    mimeType,
    originalName: input.file.name || 'file',
    folder: input.folder,
  });

  return createAsset({
    name: input.name || input.file.name,
    fileName: uploaded.fileName,
    originalName: input.file.name,
    storageKey: uploaded.storageKey,
    url: uploaded.url,
    mimeType,
    fileType: guessFileType(mimeType),
    fileSize: input.file.size,
    altText: input.altText,
    caption: input.caption,
    description: input.description,
    metadata: input.metadata || {},
    isPublic: input.isPublic,
    isActive: input.isActive,
  }, userId);
}

export async function updateAsset(id: string, body: any) {
  const rows = await sql`
    UPDATE media_assets
    SET
      name = COALESCE(${body.name ?? null}, name),
      file_name = COALESCE(${body.fileName ?? null}, file_name),
      original_name = COALESCE(${body.originalName ?? null}, original_name),
      storage_key = COALESCE(${body.storageKey ?? null}, storage_key),
      url = COALESCE(${body.url ?? null}, url),
      mime_type = COALESCE(${body.mimeType ?? null}, mime_type),
      file_type = COALESCE(${body.fileType ?? null}, file_type),
      file_size = COALESCE(${body.fileSize ?? null}, file_size),
      width = COALESCE(${body.width ?? null}, width),
      height = COALESCE(${body.height ?? null}, height),
      duration_seconds = COALESCE(${body.durationSeconds ?? null}, duration_seconds),
      alt_text = COALESCE(${body.altText ?? null}, alt_text),
      caption = COALESCE(${body.caption ?? null}, caption),
      description = COALESCE(${body.description ?? null}, description),
      metadata = COALESCE(${body.metadata ? JSON.stringify(body.metadata) : null}::jsonb, metadata),
      is_public = COALESCE(${body.isPublic ?? null}, is_public),
      is_active = COALESCE(${body.isActive ?? null}, is_active),
      updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *
  `;
  return rows[0] ? mapAsset(rows[0]) : null;
}

export async function deleteAsset(id: string) {
  const current = await sql`
    SELECT id, storage_key
    FROM media_assets
    WHERE id = ${id} AND deleted_at IS NULL
    LIMIT 1
  `;

  if (!current.length) return false;

  const storageKey = current[0]?.storage_key ? String(current[0].storage_key) : '';
  if (storageKey) {
    try {
      await mediaStorage.delete(storageKey);
    } catch (error) {
      console.error('Failed to delete media file from storage:', error);
    }
  }

  const rows = await sql`
    UPDATE media_assets
    SET deleted_at = now(), is_active = false, updated_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function createOrUpdateLink(body: any, userId?: string) {
  const entityType = String(body.entityType || '').trim();
  const entityId = String(body.entityId || '').trim();
  const fieldName = String(body.fieldName || 'default');
  const mediaId = String(body.mediaId || '').trim();

  // Keep only one active media per entity+field (e.g. brand logo/category image)
  await sql`
    UPDATE media_links
    SET is_active = false, updated_at = now()
    WHERE entity_type = ${entityType}
      AND entity_id = ${entityId}
      AND field_name = ${fieldName}
      AND media_id <> ${mediaId}
      AND is_active = true
  `;

  const rows = await sql`
    INSERT INTO media_links (media_id, entity_type, entity_id, field_name, usage_type, sort_order, metadata, created_by)
    VALUES (${mediaId}, ${entityType}, ${entityId}, ${fieldName}, ${body.usageType || 'primary'}, ${Number(body.sortOrder || 0)}, ${JSON.stringify(body.metadata || {})}::jsonb, ${userId || null})
    ON CONFLICT (media_id, entity_type, entity_id, field_name)
    DO UPDATE SET usage_type = EXCLUDED.usage_type, sort_order = EXCLUDED.sort_order, metadata = EXCLUDED.metadata, is_active = true, updated_at = now()
    RETURNING *
  `;
  return rows[0];
}

export async function deleteLink(id: string) {
  const rows = await sql`
    UPDATE media_links
    SET is_active = false, updated_at = now()
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteLinksByEntity(entityType: string, entityId: string) {
  const rows = await sql`
    UPDATE media_links
    SET is_active = false, updated_at = now()
    WHERE entity_type = ${entityType}
      AND entity_id = ${entityId}
      AND is_active = true
    RETURNING id
  `;

  return { deactivatedCount: rows.length };
}
