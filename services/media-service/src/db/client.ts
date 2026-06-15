import postgres from 'postgres';
import { DATABASE_URL } from '../config/env';

export const sql = postgres(DATABASE_URL, { prepare: false });
