import { WooCommerceModel } from './model';

export const WooCommerceService = {
  async handleWebhook(eventType: string) {
    return { success: true, data: await WooCommerceModel.accept(eventType), error: null };
  }
};
