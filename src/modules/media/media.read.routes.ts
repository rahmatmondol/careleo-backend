import { mediaBase } from './base';
import { getAsset, getAssetUsage, getEntityAssets, getUsageSummary, listAssets } from './handlers/media.read';

export const mediaReadRoutes = mediaBase()
    .get('/assets', ({ query }) => listAssets(query as Record<string, string | undefined>))
    .get('/assets/:id', async ({ params, set }) => {
      const asset = await getAsset(params.id);
      if (!asset) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      return { asset };
    })
    .get('/assets/:id/usage', async ({ params, set }) => {
      const asset = await getAsset(params.id);
      if (!asset) {
        set.status = 404;
        return { error: 'Media not found' };
      }
      return getAssetUsage(params.id);
    })
    .get('/entities/:entityType/:entityId', ({ params }) =>
      getEntityAssets(params.entityType, params.entityId)
    )
    .get('/usage/summary', () => getUsageSummary());
