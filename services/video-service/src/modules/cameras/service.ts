import { CamerasModel } from './model';
import type { CreateCameraInput, UpdateCameraInput } from '../../types';

/** Business logic for pet cameras. Returns `{ data }` on success or `{ status, error }` on failure. */
export const CamerasService = {
  async list(userId: string) {
    return { data: { cameras: await CamerasModel.listByUser(userId) } };
  },

  async get(userId: string, id: string) {
    const camera = await CamerasModel.findById(userId, id);
    if (!camera) return { status: 404, error: 'Camera not found' };
    return { data: { camera } };
  },

  async create(userId: string, input: CreateCameraInput) {
    if (!input.name?.trim()) return { status: 400, error: 'name is required' };
    const camera = await CamerasModel.insert({
      userId, petId: input.petId, name: input.name, streamUrl: input.streamUrl,
    });
    if (!camera) return { status: 500, error: 'Failed to create camera' };
    return { data: { camera } };
  },

  async update(userId: string, id: string, input: UpdateCameraInput) {
    const camera = await CamerasModel.findById(userId, id);
    if (!camera) return { status: 404, error: 'Camera not found' };

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.petId !== undefined) updates.petId = input.petId;
    if (input.streamUrl !== undefined) updates.streamUrl = input.streamUrl;
    if (input.status !== undefined) updates.status = input.status;
    if (Object.keys(updates).length === 0) return { data: { camera } };

    const updated = await CamerasModel.update(id, updates);
    return { data: { camera: updated } };
  },

  async remove(userId: string, id: string) {
    const camera = await CamerasModel.findById(userId, id);
    if (!camera) return { status: 404, error: 'Camera not found' };
    await CamerasModel.remove(id);
    return { data: { deleted: true, id } };
  },
};
