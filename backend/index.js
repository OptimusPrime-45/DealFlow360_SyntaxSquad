// ============================================================================
//  DealFlow360 — server entrypoint
//
//  `dotenv/config` MUST be the first import. Several modules (notably
//  middleware/auth.middleware.js) read process.env at module-evaluation time,
//  and ES module imports are evaluated in source order — so loading .env any
//  later means those modules silently fall back to their dev defaults.
// ============================================================================

import "dotenv/config";

import app from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log("=========================================");
      console.log(` DealFlow360 API running on port ${PORT}`);
      console.log(` Health check:    http://localhost:${PORT}/api/health`);
      console.log(` Customer Portal: http://localhost:3000/portal/:token`);
      console.log("=========================================");
    });

    // Verify the database is actually reachable. Non-fatal on purpose: the
    // server should still boot so /api/health answers and the failure is
    // visible, rather than the process dying silently at startup.
    prisma
      .$connect()
      .then(() => console.log("✔ PostgreSQL connected via Prisma"))
      .catch((err) =>
        console.warn(
          `⚠ Database connection failed (is Postgres running?): ${err.message}`
        )
      );
  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

startServer();
