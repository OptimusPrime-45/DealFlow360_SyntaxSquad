import { ZodError } from "zod";
import { ApiError } from "../utils/api-error.js";

/**
 * Centralized error handler middleware.
 * Formats errors into the standardized JSON envelope:
 * { success: false, error: { message, code, errors } }
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let errors = err.issues || err.errors || [];

  // Handle Zod validation errors.
  //
  // zod v4 renamed the issue list from `.errors` to `.issues`. Reading the old
  // name gave `undefined.map(...)`, which threw INSIDE this handler — so Express
  // fell through to its default HTML error page and EVERY validation failure in
  // the API answered 500 text/html instead of a readable 400 JSON. Accept both.
  if (err instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed";
    const issues = err.issues || err.errors || [];
    errors = issues.map((e) => ({
      field: Array.isArray(e.path) ? e.path.join(".") : String(e.path ?? ""),
      message: e.message,
    }));
  }

  // Handle Prisma unique constraint error
  if (err.code === "P2002") {
    statusCode = 409;
    code = "DUPLICATE_RESOURCE";
    const target = err.meta?.target ? ` (${err.meta.target.join(", ")})` : "";
    message = `A resource with this identifier already exists${target}`;
  }

  // Handle Prisma record not found error
  if (err.code === "P2025") {
    statusCode = 404;
    code = "NOT_FOUND";
    message = err.meta?.cause || "Record not found";
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "INVALID_TOKEN";
    message = "Invalid authentication token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = "TOKEN_EXPIRED";
    message = "Authentication token has expired";
  }

  // Log 500 errors for internal tracking
  if (statusCode >= 500) {
    console.error("[ServerError]", err);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      errors: errors.length > 0 ? errors : undefined,
    },
  });
};

export default errorHandler;
