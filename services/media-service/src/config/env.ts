export const PORT = Number(Bun.env.PORT) || 3017;
export const DATABASE_URL = Bun.env.DATABASE_URL || 'postgres://pawly_admin:pawly_super_secret@localhost:5433/pawly_media';
export const JWT_SECRET = Bun.env.JWT_SECRET || 'super_secret_jwt_key_change_in_prod';
