import type { Role } from '@/shared/auth/rbac';

type UserRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  role: Role;
};

const users: UserRecord[] = [
  {
    id: 'u_super_1',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'super@careleo.com',
    password: 'admin123',
    role: 'super_admin',
    phone: '+8801000000000',
  },
];

export const AuthModel = {
  /**
   * Find an existing user by email from the in-memory store.
   */
  async findByEmail(email: string) {
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null;
  },

  /**
   * Create a new user record in the in-memory store.
   */
  async createUser(payload: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    role?: Role;
  }) {
    const existing = await this.findByEmail(payload.email);
    if (existing) return null;

    const user: UserRecord = {
      id: `u_${Date.now()}`,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      password: payload.password,
      role: payload.role ?? 'customer',
    };

    users.push(user);
    return user;
  },

  /**
   * Verify email + password combination.
   */
  async verifyUser(email: string, password: string) {
    const user = await this.findByEmail(email);
    if (!user || user.password !== password) return null;
    return user;
  },

  /**
   * Lookup user by ID.
   */
  async getById(id: string) {
    return users.find((u) => u.id === id) ?? null;
  },
};
