import { UserModel } from './model';

export const UserService = {
  async getMe() {
    return { success: true, data: await UserModel.getMe(), error: null };
  },
  async updateMe(payload: Record<string, unknown>) {
    return { success: true, data: await UserModel.updateMe(payload), error: null };
  }
};
