export interface AIChatSessionRow {
  id: string;
  userId: string;
  petId?: string | null;
  title?: string | null;
  sessionType?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIChatMessageRow {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  messageText: string;
  createdAt: string;
}
