import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = process.env.PORT || 4000;

const startServer = async () => {
  try {
    app.listen(PORT, () => {
      process.stdout.write(`✔ DealFlow360 backend running on port ${PORT}\n`);
    });

    prisma.$connect()
      .then(() => {
        process.stdout.write("✔ PostgreSQL connected via Prisma\n");
      })
      .catch((err) => {
        process.stdout.write(`⚠ DB Connection warning (Ensure Postgres is running): ${err.message}\n`);
      });
  } catch (error) {
    process.stderr.write(`Failed to start server: ${error.message}\n`);
    process.exit(1);
  }
};

startServer();