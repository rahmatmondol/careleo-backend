import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadDotEnv = () => {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
};

loadDotEnv();

const { app } = await import('./app');
const { AuthModel } = await import('./modules/auth/model');
const { startNotificationsWorker, bootstrapNotificationSchedules } = await import('./shared/queue');
const { startJobs } = await import('./jobs');

const port = Number(process.env.PORT || 3000);

/**
 * Ensure the local media upload directory exists.
 *
 * media-service did this in its own entry point before writing any file. With
 * the media library merged in, the first upload would otherwise fail on a fresh
 * checkout. Skipped when uploads go to S3.
 */
const { MEDIA_LOCAL_UPLOAD_DIR, STORAGE_DRIVER } = await import('./modules/media/config/storage');
if (STORAGE_DRIVER === 'local') {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(MEDIA_LOCAL_UPLOAD_DIR, { recursive: true }).catch(() => {});
}

app.listen(port);
try {
  await AuthModel.ensureReady();
} catch {}
startNotificationsWorker();
try {
  await bootstrapNotificationSchedules();
} catch {}
startJobs();
console.log(`🚀 Careleo backend running at http://localhost:${port}`);
