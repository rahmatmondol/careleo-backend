import { Elysia } from 'elysia';
import { registerAdminRoutes } from '../../services/admin/admin.service';

export function buildAdminController(app: Elysia){
  return registerAdminRoutes(app);
}
