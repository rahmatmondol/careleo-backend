import { RemindersModel } from './model';

export const RemindersService = {
  async ping() {
    return { success: true, data: await RemindersModel.ping(), error: null };
  }
};
