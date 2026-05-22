export type UserRole = 'super_admin' | 'admin' | 'support' | 'customer';

export interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  status: 'active' | 'inactive' | 'blocked';
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  role?: UserRole;
  status?: UserRow['status'];
}
