
import { app } from '../adoption-service/src/app';

const res = await app.handle(new Request('http://local/api/v1/health'));
if (res.status !== 200) throw new Error(`health failed: ${res.status}`);
console.log('adoption-service smoke: PASS');
