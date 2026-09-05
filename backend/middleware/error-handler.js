// Compatibility shim. The canonical error handler lives in error.middleware.js
// (it additionally handles Zod, Prisma P2002/P2025 and JWT errors).
// Kept so pre-merge imports of this path keep working.
export * from "./error.middleware.js";
export { default } from "./error.middleware.js";
