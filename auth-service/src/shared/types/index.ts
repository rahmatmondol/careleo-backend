export type Role = 'super_admin' | 'admin' | 'support' | 'customer';
export type AuthProvider = 'password' | 'google';

export type JwtClaims = {
  id: string;
  email: string;
  role: Role;
};

export type ApiSuccessResponse<T = unknown> = {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailureResponse = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiFailureResponse;

export type UserRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: Role;
  provider: AuthProvider;
  firebaseUid: string | null;
  avatarUrl: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthTokenType = 'email_verify' | 'password_reset' | 'create_password';

export type AuthTokenRow = {
  id: string;
  userId: string;
  token: string;
  type: AuthTokenType;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};
