import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";

/**
 * Central error handler.  Must be the last middleware registered in app.ts.
 *
 * Sends a JSON envelope:
 * {
 *   "success": false,
 *   "message": "<human readable>",
 *   "errors": [...]   // only for validation errors
 * }
 *
 * Stack traces are intentionally omitted from the response body to prevent
 * information disclosure; they are printed to the server console only.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (createHttpError.isHttpError(err)) {
    res.status(err.status).json({
      success: false,
      message: err.message,
    });
    return;
  }

  // Mongoose validation error
  if (
    err instanceof Error &&
    err.name === "ValidationError"
  ) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: (err as any).errors,
    });
    return;
  }

  // Mongoose duplicate-key error (E11000)
  if ((err as any)?.code === 11000) {
    res.status(409).json({
      success: false,
      message: "Duplicate key — a record with that value already exists",
    });
    return;
  }

  // Generic fallback — never expose the real error message to the client
  console.error("[ERROR]", err);
  res.status(500).json({
    success: false,
    message: "An unexpected error occurred",
  });
};

export default errorHandler;
