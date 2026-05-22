import { AiModel } from './model';

export const AiService = {
  async ping() {
    return { success: true, data: await AiModel.ping(), error: null };
  }
};
