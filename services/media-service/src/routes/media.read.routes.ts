import { Elysia } from 'elysia';
import { getAsset, getAssetUsage, getEntityAssets, getUsageSummary, listAssets } from '../handlers/media.read';

export const mediaReadRoutes = (app: Elysia) =>
  app
    .get('/api/v1/media/assets', ({ query }) => listAssets(query as Record<string, string | undefined>))
    .get('/api/v1/media/assets/:id', async ({ params, set }) => {
      const asset = await getAsset(params.id);
      if (!asset) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      return { asset };
    })
    .get('/api/v1/media/assets/:id/usage', async ({ params, set }) => {
      const asset = await getAsset(params.id);
      if (!asset) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      return getAssetUsage(params.id);
    })
    .get('/api/v1/media/entities/:entityType/:entityId', ({ params }) =>
      getEntityAssets(params.entityType, params.entityId)
    )
    .get('/api/v1/media/usage/summary', () => getUsageSummary());
