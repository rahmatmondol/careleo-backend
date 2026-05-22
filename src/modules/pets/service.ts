import { PetsModel } from './model';

export const PetsService = {
  async ping() {
    return { success: true, data: await PetsModel.ping(), error: null };
  }
};
