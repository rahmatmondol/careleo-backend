export interface VideoConsultation {
  id: string;
  userId: string;
  vetId: string;
  petId?: string | null;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledAt: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
  roomId?: string | null;
  notes?: string | null;
  recordingUrl?: string | null;
  createdAt: Date;
}

export interface PetCamera {
  id: string;
  userId: string;
  petId?: string | null;
  name: string;
  streamUrl?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'STREAMING';
  lastSeenAt?: Date | null;
  createdAt: Date;
}

export interface VideoSession {
  id: string;
  consultationId?: string | null;
  cameraId?: string | null;
  userId: string;
  status: 'ACTIVE' | 'ENDED';
  startedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
}

export interface CreateConsultationInput {
  vetId: string;
  petId?: string;
  scheduledAt: string;
  notes?: string;
}

export interface CreateCameraInput {
  petId?: string;
  name: string;
  streamUrl?: string;
}

export interface UpdateCameraInput {
  petId?: string;
  name?: string;
  streamUrl?: string;
  status?: string;
}
