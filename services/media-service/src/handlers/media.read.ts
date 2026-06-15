import { sql } from '../db/client';

export const mapAsset = (r: any) => {
  if (!r || typeof r !== 'object') return r;
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    fileName: r.file_name,
    originalName: r.original_name,
    storageKey: r.storage_key,
    url: r.url,
    mimeType: r.mime_type,
    fileType: r.file_type,
    fileSize: Number(r.file_size || 0),
    width: r.width,
    height: r.height,
    durationSeconds: r.duration_seconds,
    altText: r.alt_text,
    caption: r.caption,
    description: r.description,
    metadata: r.metadata,
    uploadedBy: r.uploaded_by,
    isPublic: r.is_public,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    usedCount: Number(r.used_count ?? 0),
    fieldName: r.fieldName ?? r.field_name,
    usageType: r.usageType ?? r.usage_type,
    sortOrder: r.sortOrder ?? r.sort_order,
  };
};

export async function listAssets(query: Record<string, string | undefined>) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 20), 1), 200);
  const offset = (page - 1) * limit;

  const fileType = query.fileType?.trim().toLowerCase() || null;
  const mimeType = query.mimeType?.trim().toLowerCase() || null;
  const used = query.used?.trim().toLowerCase() || null;
  const search = query.search?.trim().toLowerCase() || null;

  const rows = await sql`
    WITH usage_counts AS (
      SELECT media_id, COUNT(*)::int AS used_count
      FROM media_links
      WHERE is_active = true
      GROUP BY media_id
    )
    SELECT m.*, COALESCE(u.used_count, 0) AS used_count
    FROM media_assets m
    LEFT JOIN usage_counts u ON u.media_id = m.id
    WHERE m.deleted_at IS NULL
    ORDER BY m.created_at DESC
  `;

  const filtered = rows.filter((r: any) => {
    if (fileType && String(r.file_type || '').toLowerCase() !== fileType) return false;
    if (mimeType && String(r.mime_type || '').toLowerCase() !== mimeType) return false;
    if (used === 'true' && Number(r.used_count || 0) <= 0) return false;
    if (used === 'false' && Number(r.used_count || 0) > 0) return false;
    if (search) {
      const hay = `${r.name || ''} ${r.file_name || ''} ${r.alt_text || ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const paged = filtered.slice(offset, offset + limit);
  return {
    assets: paged.map(mapAsset),
    total: filtered.length,
    page,
    limit,
  };
}

export async function getAsset(id: string) {
  const rows = await sql`SELECT * FROM media_assets WHERE id = ${id} AND deleted_at IS NULL LIMIT 1`;
  return rows[0] ? mapAsset(rows[0]) : null;
}

export async function getAssetUsage(id: string) {
  const links = await sql`
    SELECT id, entity_type AS "entityType", entity_id AS "entityId", field_name AS "fieldName", usage_type AS "usageType", sort_order AS "sortOrder", metadata, created_at AS "createdAt"
    FROM media_links
    WHERE media_id = ${id} AND is_active = true
    ORDER BY entity_type, field_name, sort_order ASC
  `;
  return { mediaId: id, links, usedCount: links.length };
}

export async function getEntityAssets(entityType: string, entityId: string) {
  const links = await sql`
    SELECT l.id, l.field_name AS "fieldName", l.usage_type AS "usageType", l.sort_order AS "sortOrder", m.*
    FROM media_links l
    JOIN media_assets m ON m.id = l.media_id
    WHERE l.entity_type = ${entityType}
      AND l.entity_id = ${entityId}
      AND l.is_active = true
      AND m.deleted_at IS NULL
    ORDER BY l.field_name ASC, l.sort_order ASC, m.created_at DESC
  `;
  return { entityType, entityId, assets: links.map(mapAsset) };
}

export async function getUsageSummary() {
  const summary = await sql`
    SELECT
      COUNT(*)::int AS total_assets,
      COUNT(*) FILTER (WHERE file_type = 'image')::int AS total_images,
      COUNT(*) FILTER (WHERE file_type = 'video')::int AS total_videos,
      COUNT(*) FILTER (WHERE file_type = 'file')::int AS total_files,
      COUNT(*) FILTER (WHERE COALESCE(link_counts.cnt, 0) = 0)::int AS unused_assets,
      COUNT(*) FILTER (WHERE COALESCE(link_counts.cnt, 0) > 0)::int AS used_assets
    FROM media_assets m
    LEFT JOIN (
      SELECT media_id, COUNT(*)::int AS cnt
      FROM media_links
      WHERE is_active = true
      GROUP BY media_id
    ) link_counts ON link_counts.media_id = m.id
    WHERE m.deleted_at IS NULL
  `;
  return { summary: summary[0] || {} };
}
