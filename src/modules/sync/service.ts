import { SyncModel } from './model';

export const SyncService = {
  async ping() {
    return { success: true, data: await SyncModel.ping(), error: null };
  }
};
