
import { app } from './app';
const port = Number(process.env.PORT || 4016);
app.listen(port);
console.log(`🚀 shop-bridge-service running at http://localhost:${port}`);
