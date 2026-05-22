import { StoreBridgeModel } from './model';

export const StoreBridgeService = {
  async ping() {
    return { success: true, data: await StoreBridgeModel.ping(), error: null };
  }
};
