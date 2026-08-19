import { Router } from "express";
import { requireAdmin } from "../middleware/auth.middleware";
import {
  createFormSchema,
  listFormSchemas,
  getFormSchema,
  updateFormSchema,
  publishFormSchema,
  cloneFormSchema,
  validateCreateFormSchema,
  validateUpdateFormSchema,
} from "../controllers/form-schema.controller";

const router = Router();

// All form-schema management routes are ADMIN only.
// SCR-3.3 (Dynamic Request Form Designer) must be hidden from customers.
// Customers never directly access these endpoints — the rendered form fields
// are embedded at portal ticket-creation time.

// POST   /form-schemas              — create DRAFT schema (INT-US-002)
router.post("/", requireAdmin, validateCreateFormSchema, createFormSchema);

// GET    /form-schemas              — list all schemas for tenant
router.get("/", requireAdmin, listFormSchemas);

// GET    /form-schemas/:id          — single schema
router.get("/:id", requireAdmin, getFormSchema);

// PATCH  /form-schemas/:id          — update a DRAFT schema (INT-US-002)
router.patch("/:id", requireAdmin, validateUpdateFormSchema, updateFormSchema);

// POST   /form-schemas/:id/publish  — publish → immutable (INT-US-002)
router.post("/:id/publish", requireAdmin, publishFormSchema);

// POST   /form-schemas/:id/clone    — clone published schema into new DRAFT (INT-US-002)
router.post("/:id/clone", requireAdmin, cloneFormSchema);

export default router;
