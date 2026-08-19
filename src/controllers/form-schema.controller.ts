import { Request, Response, NextFunction } from "express";
import { body } from "express-validator";
import validateRequest from "../middleware/validate.middleware";
import { formSchemaService } from "../services/form-schema.service";

// ─── Validation ───────────────────────────────────────────────────────────────

export const validateCreateFormSchema = [
  body("name").notEmpty().withMessage("name is required"),
  body("code").notEmpty().withMessage("code is required"),
  validateRequest,
];

export const validateUpdateFormSchema = [
  body("name").optional().isString().withMessage("name must be a string"),
  body("fields").optional().isArray().withMessage("fields must be an array"),
  validateRequest,
];

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /form-schemas
 * Create a new DRAFT form schema (INT-US-002)
 * Admin only — customers must not see the form designer (SCR-3.3).
 */
export const createFormSchema = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = await formSchemaService.create({
      tenantId: res.locals.tenantId,
      userId: res.locals.userId,
      ...req.body,
    });
    res.status(201).json({ success: true, data: schema });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /form-schemas
 * Admin only — lists all schemas for the tenant.
 */
export const listFormSchemas = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schemas = await formSchemaService.list(res.locals.tenantId);
    res.json({ success: true, data: schemas });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /form-schemas/:id
 * Admin only — retrieve a single form schema by id.
 * Note: customers access the rendered form at portal ticket-creation time;
 * they never call this raw endpoint directly.
 */
export const getFormSchema = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = await formSchemaService.getById(
      res.locals.tenantId,
      req.params.id,
    );
    res.json({ success: true, data: schema });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /form-schemas/:id
 * Update a DRAFT schema (INT-US-002 — published schemas are immutable).
 * Admin only.
 */
export const updateFormSchema = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = await formSchemaService.update(
      res.locals.tenantId,
      req.params.id,
      { userId: res.locals.userId, ...req.body },
    );
    res.json({ success: true, data: schema });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /form-schemas/:id/publish
 * Publish a DRAFT schema — makes it immutable (INT-US-002).
 * Admin only.
 */
export const publishFormSchema = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = await formSchemaService.publish(
      res.locals.tenantId,
      req.params.id,
      res.locals.userId,
    );
    res.json({ success: true, data: schema });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /form-schemas/:id/clone
 * Clone a schema (typically a PUBLISHED one) into a new DRAFT with incremented version.
 * Admin only.
 */
export const cloneFormSchema = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const schema = await formSchemaService.clone(
      res.locals.tenantId,
      req.params.id,
      res.locals.userId,
    );
    res.status(201).json({ success: true, data: schema });
  } catch (err) {
    next(err);
  }
};
