
import { app } from './app';
const port = Number(process.env.PORT || 4011);
app.listen(port);
console.log(`🚀 vet-service running at http://localhost:${port}`);
