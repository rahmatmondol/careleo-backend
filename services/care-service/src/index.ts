
import { app } from './app';
const port = Number(process.env.PORT || 4012);
app.listen(port);
console.log(`🚀 care-service running at http://localhost:${port}`);
