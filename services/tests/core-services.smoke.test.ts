
import { app as authApp } from '../auth-service/src/app';
import { app as userApp } from '../user-service/src/app';
import { app as petApp } from '../pet-service/src/app';
import { app as shopApp } from '../shop-bridge-service/src/app';
import { app as socialApp } from '../social-service/src/app';
import { app as notifApp } from '../notification-service/src/app';
import { app as adminApp } from '../admin-service/src/app';

const apps = [
  ['auth', authApp],
  ['user', userApp],
  ['pet', petApp],
  ['shop-bridge', shopApp],
  ['social', socialApp],
  ['notification', notifApp],
  ['admin', adminApp],
] as const;

for (const [name, app] of apps) {
  const res = await app.handle(new Request('http://local/api/v1/health'));
  if (res.status !== 200) throw new Error(`${name} health failed: ${res.status}`);
}

console.log('core services smoke: PASS');
