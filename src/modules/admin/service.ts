import { AdminModel } from './model';

export const AdminService = {
  async ping() {
    return { success: true, data: await AdminModel.ping(), error: null };
  }
};
