import { PORT } from './config/env';
import { ensureSchema } from './db/schema';
import { app } from './app';
import { MEDIA_LOCAL_UPLOAD_DIR, STORAGE_DRIVER } from './config/storage';
import { mkdir } from 'node:fs/promises';

await ensureSchema();
if (STORAGE_DRIVER === 'local') {
  await mkdir(MEDIA_LOCAL_UPLOAD_DIR, { recursive: true });
}
app.listen(PORT);
console.log(`📦 media-service running at http://localhost:${PORT}`);
