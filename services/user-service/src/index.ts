
import { app } from './app';
const port = Number(process.env.PORT || 4014);
app.listen(port);
console.log(`🚀 user-service running at http://localhost:${port}`);
