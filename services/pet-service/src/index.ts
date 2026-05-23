
import { app } from './app';
const port = Number(process.env.PORT || 4015);
app.listen(port);
console.log(`🚀 pet-service running at http://localhost:${port}`);
