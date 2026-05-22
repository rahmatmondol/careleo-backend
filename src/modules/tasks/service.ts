import { TasksModel } from './model';

export const TasksService = {
  async ping() {
    return { success: true, data: await TasksModel.ping(), error: null };
  }
};
