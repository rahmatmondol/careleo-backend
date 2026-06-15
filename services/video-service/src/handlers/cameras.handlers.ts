import { db } from '../db';
import { petCameras } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { CreateCameraInput, UpdateCameraInput } from '../types';

export async function getCameras(userId: string) {
  const cameras = await db
    .select()
    .from(petCameras)
    .where(eq(petCameras.userId, userId))
    .orderBy(desc(petCameras.createdAt))
    .limit(100);
  return cameras;
}

export async function getCamera(userId: string, id: string) {
  const [camera] = await db
    .select()
    .from(petCameras)
    .where(and(eq(petCameras.id, id), eq(petCameras.userId, userId)))
    .limit(1);
  return camera || null;
}

export async function createCamera(userId: string, input: CreateCameraInput) {
  const [camera] = await db
    .insert(petCameras)
    .values({
      userId,
      petId: input.petId || null,
      name: input.name,
      streamUrl: input.streamUrl || null,
      status: 'OFFLINE',
    })
    .returning();
  return camera;
}

export async function updateCamera(userId: string, id: string, input: UpdateCameraInput) {
  const [camera] = await db
    .select()
    .from(petCameras)
    .where(and(eq(petCameras.id, id), eq(petCameras.userId, userId)))
    .limit(1);
  if (!camera) return null;

  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.petId !== undefined) updates.petId = input.petId;
  if (input.streamUrl !== undefined) updates.streamUrl = input.streamUrl;
  if (input.status !== undefined) updates.status = input.status;

  if (Object.keys(updates).length === 0) return camera;

  const [updated] = await db
    .update(petCameras)
    .set(updates)
    .where(eq(petCameras.id, id))
    .returning();
  return updated;
}

export async function deleteCamera(userId: string, id: string) {
  const [camera] = await db
    .select()
    .from(petCameras)
    .where(and(eq(petCameras.id, id), eq(petCameras.userId, userId)))
    .limit(1);
  if (!camera) return null;

  await db.delete(petCameras).where(eq(petCameras.id, id));
  return { deleted: true, id };
}
