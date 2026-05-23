
import { app as vetApp } from '../vet-service/src/app';
import { app as careApp } from '../care-service/src/app';

for (const [name, app] of [['vet', vetApp], ['care', careApp]] as const) {
  const res = await app.handle(new Request('http://local/api/v1/health'));
  if (res.status !== 200) throw new Error(`${name} health failed: ${res.status}`);
}
console.log('vet-service + care-service smoke: PASS');
