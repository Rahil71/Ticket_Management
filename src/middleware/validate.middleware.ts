import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

/**
 * Runs after express-validator chains.
 * If there are validation errors it short-circuits with HTTP 400.
 */
const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array(),
    });
    return;
  }
  next();
};

export default validateRequest;
