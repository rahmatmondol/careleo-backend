
import { app } from './app';
const port = Number(process.env.PORT || 4019);
app.listen(port);
console.log(`🚀 admin-service running at http://localhost:${port}`);
