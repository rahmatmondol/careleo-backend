import { UsersModel } from './model';

export const UsersService = {
  async ping() {
    return { success: true, data: await UsersModel.ping(), error: null };
  }
};
