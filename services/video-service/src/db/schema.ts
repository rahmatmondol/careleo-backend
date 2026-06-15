import { pgTable, uuid, varchar, timestamp, text, boolean } from 'drizzle-orm/pg-core';

export const videoConsultations = pgTable('video_consultations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  vetId: uuid('vet_id').notNull(),
  petId: uuid('pet_id'),
  status: varchar('status', { length: 20 }).default('SCHEDULED').notNull(),
  scheduledAt: timestamp('scheduled_at').notNull(),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  roomId: varchar('room_id', { length: 100 }).unique(),
  notes: text('notes'),
  recordingUrl: varchar('recording_url', { length: 500 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const petCameras = pgTable('pet_cameras', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  petId: uuid('pet_id'),
  name: varchar('name', { length: 100 }).notNull(),
  streamUrl: varchar('stream_url', { length: 500 }),
  status: varchar('status', { length: 20 }).default('OFFLINE'),
  lastSeenAt: timestamp('last_seen_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const videoSessions = pgTable('video_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  consultationId: uuid('consultation_id').references(() => videoConsultations.id),
  cameraId: uuid('camera_id').references(() => petCameras.id),
  userId: uuid('user_id').notNull(),
  status: varchar('status', { length: 20 }).default('ACTIVE'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
