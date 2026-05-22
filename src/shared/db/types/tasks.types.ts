export interface TaskRow {
  id: string;
  userId: string;
  petId: string;
  title: string;
  taskType: string;
  dueAt: string;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReminderRow {
  id: string;
  userId: string;
  petId: string;
  title: string;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
  timeOfDay: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
