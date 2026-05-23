
import { app } from './app';
const port = Number(process.env.PORT || 4017);
app.listen(port);
console.log(`🚀 social-service running at http://localhost:${port}`);
