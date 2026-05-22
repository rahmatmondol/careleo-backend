import { AuditModel } from './model';

export const AuditService = {
  async ping() {
    return { success: true, data: await AuditModel.ping(), error: null };
  }
};
