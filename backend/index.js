import 'dotenv/config';
import app from './app.js';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` DealFlow360 API Server running on port ${PORT}`);
  console.log(` Customer Portal: http://localhost:3000/portal/:token`);
  console.log(` Health check:    http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});
