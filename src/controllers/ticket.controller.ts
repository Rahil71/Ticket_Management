import { Request, Response, NextFunction } from "express";
import { body, param } from "express-validator";
import validateRequest from "../middleware/validate.middleware";
import { ticketService } from "../services/ticket.service";
import { ITicket } from "../models/Ticket";

// ─── Validation chains ────────────────────────────────────────────────────────

/**
 * Agent/admin ticket creation (POST /tickets).
 *
 * INT-US-005: When an agent creates a ticket on behalf of a caller, the agent
 * picks the customer (requesterId). For portal/email/api sources the customer
 * is identified by the session (portal) or channel (email ingest) — not by a
 * body field.  We therefore require requesterId only when source is "AGENT" or
 * "PHONE" (agent-originated channels), and forbid callers from overriding their
 * own identity via the body.
 *
 * Security: tenantId, createdBy, and updatedBy are always taken from
 * res.locals (set by Team 1's JWT middleware) — never from the request body.
 * This prevents impersonation.
 */
export const validateCreateTicket = [
  // requesterId is required only when the agent is filing on behalf of someone else.
  // For PORTAL / EMAIL / CHAT / API the system derives the requester from the session.
  body("requesterId")
    .if(body("source").isIn(["AGENT", "PHONE"]))
    .notEmpty()
    .isMongoId()
    .withMessage("requesterId is required for AGENT/PHONE source and must be a valid ObjectId"),
  // customerName is an optional human-readable label for display; only relevant for
  // agent-created tickets where the requester record may not yet exist.
  body("customerName")
    .optional()
    .isString()
    .withMessage("customerName must be a string"),
  body("source")
    .notEmpty()
    .isIn(["PORTAL", "EMAIL", "PHONE", "CHAT", "API", "AGENT"])
    .withMessage("Invalid source value"),
  body("subject")
    .notEmpty()
    .isLength({ max: 250 })
    .withMessage("subject is required and max 250 chars"),
  body("description").notEmpty().withMessage("description is required"),
  body("ticketType")
    .optional()
    .isIn(["INCIDENT", "SERVICE_REQUEST", "QUESTION", "COMPLAINT"]),
  body("priority").optional().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  body("impact").optional().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  body("urgency").optional().isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  body("attachmentIds")
    .optional()
    .isArray()
    .withMessage("attachmentIds must be an array"),
  body("attachmentIds.*")
    .optional()
    .isMongoId()
    .withMessage("Each attachmentId must be a valid ObjectId"),
  validateRequest,
];

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /tickets
 * Create a new ticket — agent/admin facing (INT-US-001, INT-US-005).
 *
 * Identity is always taken from res.locals (JWT claims via Team 1 middleware).
 * - tenantId  → res.locals.tenantId
 * - userId    → res.locals.userId  (the acting agent; becomes createdBy)
 * - For AGENT/PHONE source: requesterId must be supplied in the body (the customer
 *   being served). For all other sources requesterId defaults to the acting userId
 *   (the agent is filing for themselves, rare but valid for API/CHAT channels).
 *
 * After creation the service automatically calls Team 6 to:
 *   1. Calculate priority from impact × urgency
 *   2. Simulate the assignment rule (category / customerTier / location)
 *   3. Fetch SLA deadlines for the resolved priority
 */
export const createTicket = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const source: string = req.body.source;
    const agentSources = ["AGENT", "PHONE"];

    // Determine requester: for agent/phone sources the body must supply it;
    // for all other sources fall back to the acting user from the token.
    const requesterId: string =
      agentSources.includes(source)
        ? req.body.requesterId
        : (res.locals.userId as string);

    const ticket = await ticketService.create({
      tenantId: res.locals.tenantId,
      userId: res.locals.userId,
      requesterId,
      source: source as ITicket["source"],
      subject: req.body.subject,
      description: req.body.description,
      ticketType: req.body.ticketType,
      organizationId: req.body.organizationId,
      contactId: req.body.contactId,
      serviceCatalogItemId: req.body.serviceCatalogItemId,
      assetId: req.body.assetId,
      categoryId: req.body.categoryId,
      subcategoryId: req.body.subcategoryId,
      priority: req.body.priority,
      impact: req.body.impact,
      urgency: req.body.urgency,
      assignedTeamId: req.body.assignedTeamId,
      assignedAgentId: req.body.assignedAgentId,
      // Team 6 assignment simulation inputs
      categoryName: req.body.categoryName,
      customerTier: req.body.customerTier,
      location: req.body.location,
      tags: req.body.tags,
      submittedFields: req.body.submittedFields,
      customFields: req.body.customFields,
      attachmentIds: req.body.attachmentIds,
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};

// ─── Status Transition (Team 6 workflow-gated) ────────────────────────────────

/**
 * Validation for PATCH /tickets/:id/status
 *
 * The workflowId is required — it is the workflowDefinitionId stored on the
 * ticket and is used as the path parameter for Team 6's can-transition check.
 */
export const validateTransitionStatus = [
  param("id").isMongoId().withMessage("Ticket id must be a valid ObjectId"),
  body("workflowId")
    .notEmpty()
    .isMongoId()
    .withMessage("workflowId is required and must be a valid ObjectId"),
  body("toStatus")
    .notEmpty()
    .isIn([
      "NEW",
      "OPEN",
      "IN_PROGRESS",
      "PENDING_CUSTOMER",
      "PENDING_VENDOR",
      "ESCALATED",
      "RESOLVED",
      "CLOSED",
      "CANCELLED",
    ])
    .withMessage("toStatus must be a valid ticket status"),
  validateRequest,
];

/**
 * PATCH /tickets/:id/status
 * Transition a ticket's status through Team 6's workflow engine (INT-US-006).
 *
 * Calls Team 6 POST /api/workflows/:workflowId/can-transition.
 * Returns 409 if the transition is not permitted by the workflow definition.
 *
 * Security: userId is taken from res.locals (JWT claims) — never from the body.
 */
export const transitionTicketStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const ticket = await ticketService.transitionStatus(
      res.locals.tenantId,
      req.params.id,
      {
        userId: res.locals.userId,
        workflowId: req.body.workflowId,
        toStatus: req.body.toStatus as ITicket["status"],
      },
    );
    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
};
