
import { app } from './app';
const port = Number(process.env.PORT || 4018);
app.listen(port);
console.log(`🚀 notification-service running at http://localhost:${port}`);
