import { ConsultationsModel } from '../consultations/model';
import { CamerasModel } from '../cameras/model';
import { SessionsModel } from '../sessions/model';

const VALID_CONSULTATION_STATUS = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/** Admin/moderation logic for video-service. Returns `{ data }` or `{ status, error }`. */
export const AdminService = {
  // ─── Consultations ─────────────────────────────────────
  async listConsultations(opts: { status?: string; vetId?: string; userId?: string; page?: number; limit?: number }) {
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const offset = (page - 1) * limit;
    const [consultations, total] = await Promise.all([
      ConsultationsModel.listAllForAdmin({ status: opts.status, vetId: opts.vetId, userId: opts.userId, limit, offset }),
      ConsultationsModel.countAll(),
    ]);
    return { data: { consultations, total, page, limit } };
  },

  async getConsultation(id: string) {
    const consultation = await ConsultationsModel.findByIdAdmin(id);
    if (!consultation) return { status: 404, error: 'Consultation not found' };
    return { data: { consultation } };
  },

  /** Admin status override (e.g. force-cancel/complete). */
  async setConsultationStatus(id: string, status: string) {
    if (!VALID_CONSULTATION_STATUS.includes(status)) {
      return { status: 400, error: `status must be one of: ${VALID_CONSULTATION_STATUS.join(', ')}` };
    }
    const consultation = await ConsultationsModel.findByIdAdmin(id);
    if (!consultation) return { status: 404, error: 'Consultation not found' };
    const data: Record<string, unknown> = { status };
    if (status === 'CANCELLED' || status === 'COMPLETED') data.endedAt = new Date();
    const updated = await ConsultationsModel.update(id, data);
    return { data: { consultation: updated } };
  },

  // ─── Cameras ───────────────────────────────────────────
  async listCameras(opts: { status?: string; page?: number; limit?: number }) {
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const offset = (page - 1) * limit;
    const [cameras, total] = await Promise.all([
      CamerasModel.listAllForAdmin({ status: opts.status, limit, offset }),
      CamerasModel.countAll(),
    ]);
    return { data: { cameras, total, page, limit } };
  },

  // ─── Sessions ──────────────────────────────────────────
  async listSessions(opts: { status?: string; page?: number; limit?: number }) {
    const page = opts.page || 1;
    const limit = opts.limit || 20;
    const offset = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      SessionsModel.listAllForAdmin({ status: opts.status, limit, offset }),
      SessionsModel.countAll(),
    ]);
    return { data: { sessions, total, page, limit } };
  },

  // ─── Analytics ─────────────────────────────────────────
  /** Dashboard metrics: consultation totals by status, camera/session counts, 7-day trend. */
  async analytics() {
    const [
      totalConsultations, consultationsByStatus, consultationTrend,
      totalCameras, camerasByStatus,
      totalSessions, activeSessions,
    ] = await Promise.all([
      ConsultationsModel.countAll(),
      ConsultationsModel.countsByStatus(),
      ConsultationsModel.dailyCounts(7),
      CamerasModel.countAll(),
      CamerasModel.countsByStatus(),
      SessionsModel.countAll(),
      SessionsModel.countActive(),
    ]);
    return {
      data: {
        consultations: { total: Number(totalConsultations), byStatus: consultationsByStatus, trend: consultationTrend },
        cameras: { total: Number(totalCameras), byStatus: camerasByStatus },
        sessions: { total: Number(totalSessions), active: Number(activeSessions) },
      },
    };
  },
};
