import { t } from 'elysia';
import { mediaBase } from './base';
import { createAsset, createOrUpdateLink, deleteAsset, deleteLink, deleteLinksByEntity, updateAsset, uploadAndCreateAsset } from './handlers/media.manage';
import { getAsset } from './handlers/media.read';

export const mediaManageRoutes = mediaBase()
    .post('/upload', async ({ request, user, set }) => {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        set.status = 400;
        return { error: 'file is required (multipart/form-data)' };
      }

      const metadataRaw = form.get('metadata');
      let metadata: any = {};
      if (typeof metadataRaw === 'string' && metadataRaw.trim()) {
        try { metadata = JSON.parse(metadataRaw); } catch { metadata = { raw: metadataRaw }; }
      }

      const asset = await uploadAndCreateAsset({
        file,
        folder: String(form.get('folder') || 'misc'),
        name: form.get('name') ? String(form.get('name')) : undefined,
        altText: form.get('altText') ? String(form.get('altText')) : undefined,
        caption: form.get('caption') ? String(form.get('caption')) : undefined,
        description: form.get('description') ? String(form.get('description')) : undefined,
        metadata,
        isPublic: form.get('isPublic') ? String(form.get('isPublic')).toLowerCase() === 'true' : undefined,
        isActive: form.get('isActive') ? String(form.get('isActive')).toLowerCase() === 'true' : undefined,
      }, user?.id);

      set.status = 201;
      return { asset };
    })
    .post('/assets', async ({ body, user, set }) => {
      const b = body as any;
      const cleanedName = String(b.name || b.originalName || b.fileName || '').trim();
      if (!cleanedName) {
        set.status = 400;
        return { error: 'name is required' };
      }
      const asset = await createAsset(b, user?.id);
      set.status = 201;
      return { asset };
    }, {
      body: t.Object({
        name: t.Optional(t.String()),
        fileName: t.String(),
        originalName: t.Optional(t.String()),
        storageKey: t.Optional(t.String()),
        url: t.String(),
        mimeType: t.String(),
        fileType: t.Union([t.Literal('image'), t.Literal('video'), t.Literal('file')]),
        fileSize: t.Optional(t.Numeric()),
        width: t.Optional(t.Numeric()),
        height: t.Optional(t.Numeric()),
        durationSeconds: t.Optional(t.Numeric()),
        altText: t.Optional(t.String()),
        caption: t.Optional(t.String()),
        description: t.Optional(t.String()),
        metadata: t.Optional(t.Any()),
        isPublic: t.Optional(t.Boolean()),
        isActive: t.Optional(t.Boolean()),
      })
    })
    .put('/assets/:id', async ({ params, body, set }) => {
      const asset = await updateAsset(params.id, body as any);
      if (!asset) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      return { asset };
    })
    .delete('/assets/:id', async ({ params, set }) => {
      const ok = await deleteAsset(params.id);
      if (!ok) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      return { success: true };
    })
    .post('/links', async ({ body, user, set }) => {
      const b = body as any;
      const media = await getAsset(b.mediaId);
      if (!media) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      const link = await createOrUpdateLink(b, user?.id);
      set.status = 201;
      return { link };
    }, {
      body: t.Object({
        mediaId: t.String(),
        entityType: t.String(),
        entityId: t.String(),
        fieldName: t.Optional(t.String()),
        usageType: t.Optional(t.String()),
        sortOrder: t.Optional(t.Numeric()),
        metadata: t.Optional(t.Any()),
      })
    })
    .delete('/links/:id', async ({ params, set }) => {
      const ok = await deleteLink(params.id);
      if (!ok) {
        set.status = 404;
        return { error: 'Link not found' };
      }
      return { success: true };
    })
    .delete('/links/entity/:entityType/:entityId', async ({ params }) => {
      const result = await deleteLinksByEntity(params.entityType, params.entityId);
      return { success: true, ...result };
    });
