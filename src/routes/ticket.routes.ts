import { Router } from "express";
import { requireAgentOrAdmin } from "../middleware/auth.middleware";
import {
  createTicket,
  validateCreateTicket,
  transitionTicketStatus,
  validateTransitionStatus,
} from "../controllers/ticket.controller";

const router = Router();

// All agent-facing ticket routes require AGENT or ADMIN role.
// Customers use the portal routes (/portal/tickets) instead.

// POST   /tickets              — create ticket (INT-US-001, INT-US-005)
//                                Automatically calls Team 6 for priority,
//                                assignment and SLA enrichment on creation.
router.post("/", requireAgentOrAdmin, validateCreateTicket, createTicket);

// PATCH  /tickets/:id/status   — workflow-gated status transition (INT-US-006)
//                                Calls Team 6 POST /api/workflows/:workflowId/can-transition
//                                before committing the status change.
//                                Returns 409 if the transition is not allowed.
router.patch(
  "/:id/status",
  requireAgentOrAdmin,
  validateTransitionStatus,
  transitionTicketStatus,
);

export default router;
