
import { app } from './app';
const port = Number(process.env.PORT || 4010);
app.listen(port);
console.log(`🚀 adoption-service running at http://localhost:${port}`);
