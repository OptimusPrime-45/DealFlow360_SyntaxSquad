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
  let errors = err.errors || [];

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed";
    errors = err.errors.map((e) => ({
      field: e.path.join("."),
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
