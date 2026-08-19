import { Router } from "express";
import { requireAnyRole } from "../middleware/auth.middleware";
import {
  getPortalDashboard,
  getPortalTickets,
  getPortalTicketById,
  portalCreateTicket,
  portalReopenTicket,
  validatePortalCreateTicket,
  validatePortalReopen,
} from "../controllers/portal.controller";

const router = Router();

// All portal routes require an authenticated identity (any role).
// The controllers internally check that res.locals.customerId is set for
// customer-scoped operations — agents/admins calling portal routes will get
// a 401 unless they also have a customerId in their session.
//
// SCR-3.3 (Dynamic Request Form Designer) is NOT included here — it is an
// admin-only screen and lives behind requireAdmin in /form-schemas routes.

// GET  /portal/dashboard                       — ticket summary counts (SCR-3.4)
router.get("/dashboard", requireAnyRole, getPortalDashboard);

// GET  /portal/tickets                         — customer's ticket list
router.get("/tickets", requireAnyRole, getPortalTickets);

// GET  /portal/tickets/:id                     — single ticket (own only)
router.get("/tickets/:id", requireAnyRole, getPortalTicketById);

// POST /portal/tickets                         — submit new request (INT-US-001)
router.post("/tickets", requireAnyRole, validatePortalCreateTicket, portalCreateTicket);

// POST /portal/tickets/:id/replies/reopen      — reopen ticket (INT-US-004)
// NOTE: update-status (general status change) is intentionally not provided here.
// Only the reopen action is available to customers (INT-US-004 AC).
// Status transitions for agents go through Team 6 workflow transition API.
router.post("/tickets/:id/replies/reopen", requireAnyRole, validatePortalReopen, portalReopenTicket);

export default router;
