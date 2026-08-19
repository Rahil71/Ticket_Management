import { Request, Response, NextFunction } from "express";
import { body } from "express-validator";
import validateRequest from "../middleware/validate.middleware";
import { ticketService } from "../services/ticket.service";

// ─── Customer Portal Controllers ──────────────────────────────────────────────
// These routes mirror the agent ticket routes but are scoped to the customer's
// own requesterId so they cannot see other customers' tickets.
//
// Security: customerId is always taken from res.locals (set by Team 1's JWT
// middleware from the verified token) — never from the request body.
// This prevents customers from impersonating other customers.

// ─── Customer-safe ticket projection ─────────────────────────────────────────

/**
 * INT-US-003 AC: "Only customer-visible information appears".
 * Strip internal-only fields before returning a ticket to the portal.
 * Fields excluded: assignedAgentId, assignedTeamId, internal customFields audit
 * data, and any field that is agent/admin only.
 */
function toCustomerSafeTicket(ticket: Record<string, unknown>): Record<string, unknown> {
  const {
    // Strip internal operational fields
    assignedAgentId: _agentId,
    assignedTeamId: _teamId,
    workflowDefinitionId: _wfId,
    workflowVersion: _wfVer,
    slaPolicyId: _slaPolicyId,
    firstResponseDueAt: _frDue,
    resolutionDueAt: _resDue,
    firstRespondedAt: _frAt,
    // customFields may contain internal audit data (reopenReason, reopenedBy, etc.)
    // but also legitimate customer data — pass only known-safe keys.
    customFields: _customFields,
    // Internal soft-delete flag
    isDeleted: _isDeleted,
    // Internal version key
    version: _version,
    ...safeFields
  } = ticket;

  // Re-expose only the reopen reason so customers can see why it was reopened
  const customFields = _customFields as Map<string, unknown> | Record<string, unknown> | undefined;
  const reopenReason = customFields instanceof Map
    ? customFields.get("reopenReason")
    : (customFields as Record<string, unknown> | undefined)?.reopenReason;

  // Surface SLA deadline as a read-only display field (customer-visible SLA info)
  const slaResolutionDueAt = _resDue;

  return {
    ...safeFields,
    ...(reopenReason !== undefined ? { reopenReason } : {}),
    ...(slaResolutionDueAt !== undefined ? { slaResolutionDueAt } : {}),
  };
}

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * GET /portal/dashboard
 * Ticket summary counts for the customer portal dashboard (SCR-3.4 / INT-US-003)
 */
export const getPortalDashboard = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId: string = res.locals.customerId;
    const tenantId: string = res.locals.tenantId;

    if (!customerId) {
      res.status(401).json({ success: false, message: "Customer identity required" });
      return;
    }

    const [openResult, resolvedResult, allResult] = await Promise.all([
      ticketService.list({ tenantId, requesterId: customerId, status: "OPEN", limit: 1 }),
      ticketService.list({ tenantId, requesterId: customerId, status: "RESOLVED", limit: 1 }),
      ticketService.list({ tenantId, requesterId: customerId, limit: 5 }),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          open: openResult.total,
          resolved: resolvedResult.total,
          total: allResult.total,
        },
        recentTickets: allResult.tickets.map((t) =>
          toCustomerSafeTicket(t as unknown as Record<string, unknown>),
        ),
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /portal/tickets
 * Customer's own tickets with status filter (INT-US-003, SCR-3.4)
 */
export const getPortalTickets = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId: string = res.locals.customerId;

    if (!customerId) {
      res.status(401).json({ success: false, message: "Customer identity required" });
      return;
    }

    const result = await ticketService.list({
      tenantId: res.locals.tenantId,
      requesterId: customerId,
      status: req.query.status as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });

    res.json({
      success: true,
      tickets: result.tickets.map((t) =>
        toCustomerSafeTicket(t as unknown as Record<string, unknown>),
      ),
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /portal/tickets/:id
 * Single ticket detail — customer can only see their own (INT-US-003, SCR-3.5)
 * Returns a customer-safe shape (strips internal fields).
 */
export const getPortalTicketById = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId: string = res.locals.customerId;

    if (!customerId) {
      res.status(401).json({ success: false, message: "Customer identity required" });
      return;
    }

    const ticket = await ticketService.getById(res.locals.tenantId, req.params.id);

    // Scope check: customer may only read their own tickets
    if (ticket.requesterId.toString() !== customerId) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }

    res.json({
      success: true,
      data: toCustomerSafeTicket(ticket.toObject ? ticket.toObject() : (ticket as any)),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /portal/tickets/:id/replies/reopen
 * Customer reopens a resolved ticket (INT-US-004, SCR-3.5)
 *
 * customerId is derived from the verified session token (res.locals.customerId)
 * — the customer cannot supply or override their own identity from the body.
 */
export const validatePortalReopen = [
  body("reason")
    .notEmpty()
    .withMessage("reason is required to reopen a ticket"),
  validateRequest,
];

export const portalReopenTicket = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId: string = res.locals.customerId;

    if (!customerId) {
      res.status(401).json({ success: false, message: "Customer identity required" });
      return;
    }

    const ticket = await ticketService.getById(res.locals.tenantId, req.params.id);

    if (ticket.requesterId.toString() !== customerId) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }

    const updated = await ticketService.reopen(res.locals.tenantId, req.params.id, {
      userId: customerId,
      reason: req.body.reason,
    });

    res.json({
      success: true,
      data: toCustomerSafeTicket(
        updated.toObject ? updated.toObject() : (updated as any),
      ),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /portal/tickets
 * Customer submits a new ticket from the portal (INT-US-001, SCR-3.1)
 *
 * Security: requesterId is always derived from res.locals.customerId (the
 * verified session token). Customers cannot supply a different requesterId
 * in the body — this field is explicitly excluded from the body.
 */
export const validatePortalCreateTicket = [
  body("subject")
    .notEmpty()
    .isLength({ max: 250 })
    .withMessage("subject is required, max 250 chars"),
  body("description").notEmpty().withMessage("description is required"),
  body("serviceCatalogItemId")
    .optional()
    .isMongoId()
    .withMessage("serviceCatalogItemId must be a valid ObjectId"),
  body("impact")
    .optional()
    .isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .withMessage("impact must be LOW, MEDIUM, HIGH or CRITICAL"),
  body("urgency")
    .optional()
    .isIn(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
    .withMessage("urgency must be LOW, MEDIUM, HIGH or CRITICAL"),
  body("categoryName")
    .optional()
    .isString()
    .withMessage("categoryName must be a string"),
  body("customerTier")
    .optional()
    .isString()
    .withMessage("customerTier must be a string"),
  body("location")
    .optional()
    .isString()
    .withMessage("location must be a string"),
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

export const portalCreateTicket = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId: string = res.locals.customerId;

    if (!customerId) {
      res.status(401).json({ success: false, message: "Customer identity required" });
      return;
    }

    // Security: requesterId and source are always set server-side from the
    // verified session — not accepted from the request body.
    // impact, urgency, categoryName, customerTier and location are forwarded
    // to the ticket service which calls Team 6 APIs for automatic enrichment.
    const ticket = await ticketService.create({
      tenantId: res.locals.tenantId,
      userId: customerId,
      requesterId: customerId,     // derived from login token, not body
      source: "PORTAL",            // fixed; customer portal always = PORTAL
      subject: req.body.subject,
      description: req.body.description,
      serviceCatalogItemId: req.body.serviceCatalogItemId,
      ticketType: req.body.ticketType,
      categoryId: req.body.categoryId,
      assetId: req.body.assetId,
      impact: req.body.impact,
      urgency: req.body.urgency,
      // Team 6 assignment simulation inputs
      categoryName: req.body.categoryName,
      customerTier: req.body.customerTier,
      location: req.body.location,
      tags: req.body.tags,
      submittedFields: req.body.submittedFields,
      attachmentIds: req.body.attachmentIds,
    });

    res.status(201).json({
      success: true,
      data: toCustomerSafeTicket(ticket.toObject ? ticket.toObject() : (ticket as any)),
    });
  } catch (err) {
    next(err);
  }
};
