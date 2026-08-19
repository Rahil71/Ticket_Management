import { Router } from "express";
import { requireAdmin, requireAnyRole } from "../middleware/auth.middleware";
import { listCatalogItems } from "../controllers/service-catalog.controller";

const router = Router();

// GET /service-catalogue — list items (filter by status, categoryId)
// Readable by all authenticated roles (customers browse it to pick service types).
router.get("/", requireAnyRole, listCatalogItems);

// NOTE: Create, update, publish, and delete of catalogue items are admin-only
// operations. They are intentionally not exposed as routes here until the full
// admin catalogue management UI (SCR-3.3 / admin screens) is built.
// When adding those routes, apply requireAdmin to each one.

export default router;
