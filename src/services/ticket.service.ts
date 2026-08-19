import { Types } from "mongoose";
import createHttpError from "http-errors";
import { TicketModel, ITicket } from "../models/Ticket";
import { ServiceCatalogItemModel } from "../models/ServiceCatalogItem";
import { RequestFormSchemaModel } from "../models/RequestFormSchema";
import { team6Service } from "./team6.service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Auto-generate ticket number: TKT-<tenantPrefix>-<epoch-ms> */
function generateTicketNumber(tenantId: string): string {
  const prefix = tenantId.slice(-4).toUpperCase();
  return `TKT-${prefix}-${Date.now()}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateTicketDTO {
  tenantId: string;
  userId: string;

  requesterId: string;
  organizationId?: string;
  contactId?: string;
  serviceCatalogItemId?: string;
  assetId?: string;

  source: ITicket["source"];
  subject: string;
  description: string;
  ticketType?: ITicket["ticketType"];
  categoryId?: string;
  subcategoryId?: string;
  priority?: ITicket["priority"];
  impact?: ITicket["impact"];
  urgency?: ITicket["urgency"];
  assignedTeamId?: string;
  assignedAgentId?: string;
  tags?: string[];
  submittedFields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  attachmentIds?: string[];

  // Fields forwarded to Team 6 assignment simulation
  /** Free-text category name sent to Team 6 assignment rules (e.g. "Billing") */
  categoryName?: string;
  /** Customer tier from Team 2 (e.g. "Premium") */
  customerTier?: string;
  /** Customer location from Team 2 (e.g. "Dubai") */
  location?: string;
}

export interface ListTicketsDTO {
  tenantId: string;
  status?: string;
  priority?: string;
  assignedAgentId?: string;
  assignedTeamId?: string;
  requesterId?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface UpdateTicketDTO {
  userId: string;
  /** NOTE: status cannot be changed via a generic update — use dedicated
   *  workflow transitions (Team 6) or the reopen endpoint. */
  priority?: ITicket["priority"];
  impact?: ITicket["impact"];
  urgency?: ITicket["urgency"];
  assignedTeamId?: string;
  assignedAgentId?: string;
  subject?: string;
  description?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  resolvedAt?: Date;
  closedAt?: Date;
  firstRespondedAt?: Date;
  resolutionDueAt?: Date;
  firstResponseDueAt?: Date;
  slaPolicyId?: string;
  categoryId?: string;
  subcategoryId?: string;
}

export interface ReopenTicketDTO {
  userId: string;
  reason: string;
}

export interface TransitionStatusDTO {
  userId: string;
  /** The workflowDefinitionId stored on the ticket — required for the Team 6 check */
  workflowId: string;
  toStatus: ITicket["status"];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Validate submittedFields against the RequestFormSchema linked to the chosen
 * ServiceCatalogItem (INT-US-001 AC: "mandatory fields are validated").
 *
 * Throws HTTP 422 if any required field is missing or an unknown key is present.
 */
async function validateSubmittedFields(
  tenantId: string,
  serviceCatalogItemId: string,
  submittedFields: Record<string, unknown>,
): Promise<void> {
  const catalogItem = await ServiceCatalogItemModel.findOne({
    _id: new Types.ObjectId(serviceCatalogItemId),
    tenantId: new Types.ObjectId(tenantId),
  });
  if (!catalogItem || !catalogItem.requestFormSchemaId) return;

  const formSchema = await RequestFormSchemaModel.findOne({
    _id: catalogItem.requestFormSchemaId,
    tenantId: new Types.ObjectId(tenantId),
  });
  if (!formSchema) return;

  const allowedKeys = new Set(formSchema.fields.map((f) => f.key));
  const missingRequired: string[] = [];
  const unknownKeys: string[] = [];

  // Check for missing required fields
  for (const field of formSchema.fields) {
    if (field.required && !Object.prototype.hasOwnProperty.call(submittedFields, field.key)) {
      missingRequired.push(field.key);
    }
  }

  // Check for unknown keys (only when schema has defined fields)
  if (allowedKeys.size > 0) {
    for (const key of Object.keys(submittedFields)) {
      if (!allowedKeys.has(key)) {
        unknownKeys.push(key);
      }
    }
  }

  const errors: string[] = [];
  if (missingRequired.length > 0) {
    errors.push(`Missing required fields: ${missingRequired.join(", ")}`);
  }
  if (unknownKeys.length > 0) {
    errors.push(`Unknown fields for this service type: ${unknownKeys.join(", ")}`);
  }
  if (errors.length > 0) {
    throw createHttpError(422, errors.join(". "));
  }
}

// ─── Service Functions ────────────────────────────────────────────────────────

export const ticketService = {
  /** Create a brand-new ticket, then enrich it with Team 6 priority/assignment/SLA data */
  async create(dto: CreateTicketDTO): Promise<ITicket> {
    // INT-US-001 AC: validate submitted fields against the form schema when a
    // service catalogue item is selected.
    if (dto.serviceCatalogItemId && dto.submittedFields) {
      await validateSubmittedFields(
        dto.tenantId,
        dto.serviceCatalogItemId,
        dto.submittedFields,
      );
    }

    // ── Step 1: Resolve priority via Team 6 ──────────────────────────────────
    // Use Team 6's priority-matrix to derive priority from impact × urgency.
    // Falls back to the caller-supplied value (or "MEDIUM") if Team 6 is down.
    const impact = dto.impact ?? "MEDIUM";
    const urgency = dto.urgency ?? "MEDIUM";

    let resolvedPriority: ITicket["priority"] = dto.priority ?? "MEDIUM";

    const priorityResult = await team6Service.calculatePriority(impact, urgency);
    if (priorityResult?.priority) {
      resolvedPriority = priorityResult.priority as ITicket["priority"];
    }

    // ── Step 2: Simulate assignment rule via Team 6 ───────────────────────────
    // Determine which team/agent should handle the ticket based on category,
    // customer tier and location. All three are optional — Team 6 matches on
    // whatever is supplied.
    let resolvedTeamId = dto.assignedTeamId;
    let resolvedAgentId = dto.assignedAgentId;

    const assignmentResult = await team6Service.simulateAssignment({
      category: dto.categoryName,
      customerTier: dto.customerTier,
      location: dto.location,
    });
    if (assignmentResult?.matched) {
      if (assignmentResult.targetTeamId) resolvedTeamId = assignmentResult.targetTeamId;
      if (assignmentResult.targetAgentId) resolvedAgentId = assignmentResult.targetAgentId;
    }

    // ── Step 3: Calculate SLA deadlines via Team 6 ───────────────────────────
    // Uses the final resolved priority (from Step 1 or the caller's value).
    let resolvedSlaPolicyId: string | undefined;
    let resolvedFirstResponseDueAt: Date | undefined;
    let resolvedResolutionDueAt: Date | undefined;

    const slaResult = await team6Service.calculateSla(resolvedPriority);
    if (slaResult?.policyId) {
      resolvedSlaPolicyId = slaResult.policyId;
      resolvedFirstResponseDueAt = new Date(slaResult.firstResponseDueAt);
      resolvedResolutionDueAt = new Date(slaResult.resolutionDueAt);
    }

    // ── Save ticket with enriched data ────────────────────────────────────────
    const ticket = await TicketModel.create({
      tenantId: new Types.ObjectId(dto.tenantId),
      createdBy: new Types.ObjectId(dto.userId),
      updatedBy: new Types.ObjectId(dto.userId),
      ticketNumber: generateTicketNumber(dto.tenantId),
      requesterId: new Types.ObjectId(dto.requesterId),
      organizationId: dto.organizationId
        ? new Types.ObjectId(dto.organizationId)
        : undefined,
      contactId: dto.contactId
        ? new Types.ObjectId(dto.contactId)
        : undefined,
      serviceCatalogItemId: dto.serviceCatalogItemId
        ? new Types.ObjectId(dto.serviceCatalogItemId)
        : undefined,
      assetId: dto.assetId ? new Types.ObjectId(dto.assetId) : undefined,
      source: dto.source,
      subject: dto.subject,
      description: dto.description,
      ticketType: dto.ticketType ?? "INCIDENT",
      categoryId: dto.categoryId
        ? new Types.ObjectId(dto.categoryId)
        : undefined,
      subcategoryId: dto.subcategoryId
        ? new Types.ObjectId(dto.subcategoryId)
        : undefined,
      priority: resolvedPriority,
      impact,
      urgency,
      assignedTeamId: resolvedTeamId
        ? new Types.ObjectId(resolvedTeamId)
        : undefined,
      assignedAgentId: resolvedAgentId
        ? new Types.ObjectId(resolvedAgentId)
        : undefined,
      slaPolicyId: resolvedSlaPolicyId
        ? new Types.ObjectId(resolvedSlaPolicyId)
        : undefined,
      firstResponseDueAt: resolvedFirstResponseDueAt,
      resolutionDueAt: resolvedResolutionDueAt,
      tags: dto.tags ?? [],
      submittedFields: dto.submittedFields,
      customFields: dto.customFields,
      attachmentIds: dto.attachmentIds ?? [],
      status: "NEW",
    });

    // TODO(Team 7): emit TICKET_CREATED domain event so Team 7 can send a
    // confirmation notification to the customer and Team 10 can record the
    // audit entry.  Example:
    //   eventBus.emit("ticket.created", { ticketId: ticket._id, tenantId: dto.tenantId });

    return ticket;
  },

  /** Paginated list with filters */
  async list(dto: ListTicketsDTO): Promise<{
    tickets: ITicket[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = dto.page ?? 1;
    const limit = Math.min(dto.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {
      tenantId: new Types.ObjectId(dto.tenantId),
    };

    if (dto.status) filter.status = dto.status;
    if (dto.priority) filter.priority = dto.priority;
    if (dto.assignedAgentId)
      filter.assignedAgentId = new Types.ObjectId(dto.assignedAgentId);
    if (dto.assignedTeamId)
      filter.assignedTeamId = new Types.ObjectId(dto.assignedTeamId);
    if (dto.requesterId)
      filter.requesterId = new Types.ObjectId(dto.requesterId);

    if (dto.search) {
      filter.$text = { $search: dto.search };
    }

    const [tickets, total] = await Promise.all([
      TicketModel.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TicketModel.countDocuments(filter),
    ]);

    return { tickets: tickets as unknown as ITicket[], total, page, limit };
  },

  /** Get single ticket by id (scoped to tenant) */
  async getById(tenantId: string, ticketId: string): Promise<ITicket> {
    const ticket = await TicketModel.findOne({
      _id: new Types.ObjectId(ticketId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!ticket) throw createHttpError(404, "Ticket not found");
    return ticket;
  },

  /** Partial update — status cannot be changed here; use workflow transitions */
  async update(
    tenantId: string,
    ticketId: string,
    dto: UpdateTicketDTO,
  ): Promise<ITicket> {
    const update: Record<string, unknown> = { updatedBy: new Types.ObjectId(dto.userId) };

    const simpleFields: (keyof UpdateTicketDTO)[] = [
      "priority",
      "impact",
      "urgency",
      "subject",
      "description",
      "tags",
      "resolvedAt",
      "closedAt",
      "firstRespondedAt",
      "resolutionDueAt",
      "firstResponseDueAt",
    ];

    for (const field of simpleFields) {
      if (dto[field] !== undefined) update[field] = dto[field];
    }

    const objectIdFields: (keyof UpdateTicketDTO)[] = [
      "assignedTeamId",
      "assignedAgentId",
      "slaPolicyId",
      "categoryId",
      "subcategoryId",
    ];

    for (const field of objectIdFields) {
      if (dto[field] !== undefined) {
        update[field] = new Types.ObjectId(dto[field] as string);
      }
    }

    if (dto.customFields !== undefined) update.customFields = dto.customFields;

    const ticket = await TicketModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(ticketId),
        tenantId: new Types.ObjectId(tenantId),
      },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!ticket) throw createHttpError(404, "Ticket not found");
    return ticket;
  },

  /** Soft-delete */
  async softDelete(tenantId: string, ticketId: string, userId: string): Promise<void> {
    const result = await TicketModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(ticketId),
        tenantId: new Types.ObjectId(tenantId),
      },
      { $set: { isDeleted: true, updatedBy: new Types.ObjectId(userId) } },
    );
    if (!result) throw createHttpError(404, "Ticket not found");
  },

  /**
   * Reopen a resolved/closed ticket (INT-US-004).
   *
   * Guards:
   *  1. Ticket must be RESOLVED or CLOSED.
   *  2. Reopen must be requested within the configured window (REOPEN_WINDOW_DAYS).
   *     Set REOPEN_WINDOW_DAYS=0 in env to disable the time-window check.
   */
  async reopen(
    tenantId: string,
    ticketId: string,
    dto: ReopenTicketDTO,
  ): Promise<ITicket> {
    const ticket = await TicketModel.findOne({
      _id: new Types.ObjectId(ticketId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!ticket) throw createHttpError(404, "Ticket not found");

    const reopenableStatuses: ITicket["status"][] = ["RESOLVED", "CLOSED"];
    if (!reopenableStatuses.includes(ticket.status)) {
      throw createHttpError(
        409,
        `Cannot reopen a ticket with status ${ticket.status}`,
      );
    }

    // INT-US-004 AC: "Reopen is available within configured period"
    const windowDays = parseInt(process.env.REOPEN_WINDOW_DAYS ?? "30", 10);
    if (windowDays > 0) {
      const closedTimestamp = ticket.closedAt ?? ticket.resolvedAt;
      if (closedTimestamp) {
        const windowMs = windowDays * 24 * 60 * 60 * 1000;
        const elapsed = Date.now() - closedTimestamp.getTime();
        if (elapsed > windowMs) {
          throw createHttpError(
            409,
            `Reopen window has expired. Tickets can only be reopened within ${windowDays} day(s) of resolution/closure.`,
          );
        }
      }
    }

    ticket.status = "OPEN";
    ticket.resolvedAt = undefined;
    ticket.closedAt = undefined;
    ticket.updatedBy = new Types.ObjectId(dto.userId) as unknown as Types.ObjectId;

    // Store reopen reason in customFields for audit trail
    const existingMap = (ticket.customFields as Map<string, unknown>) ?? new Map();
    const newMap = new Map<string, unknown>(existingMap);
    newMap.set("reopenReason", dto.reason);
    newMap.set("reopenedAt", new Date().toISOString());
    newMap.set("reopenedBy", dto.userId);
    ticket.customFields = newMap;

    await ticket.save();

    // TODO(Team 7): emit TICKET_REOPENED domain event so the assigned agent is
    // notified.  Example:
    //   eventBus.emit("ticket.reopened", { ticketId: ticket._id, tenantId, reason: dto.reason });

    return ticket;
  },

  /**
   * Transition ticket status — guarded by Team 6 workflow rules (INT-US-006).
   *
   * Calls Team 6's can-transition check before allowing the status change.
   * If the transition is not permitted (or the workflowId is unknown), throws
   * HTTP 409 so the agent knows the change was blocked.
   *
   * The workflowDefinitionId stored on the ticket is used as the :workflowId
   * path parameter.  If the ticket has no workflow assigned yet, the status
   * change is blocked until Team 6 configuration is complete.
   */
  async transitionStatus(
    tenantId: string,
    ticketId: string,
    dto: TransitionStatusDTO,
  ): Promise<ITicket> {
    const ticket = await TicketModel.findOne({
      _id: new Types.ObjectId(ticketId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!ticket) throw createHttpError(404, "Ticket not found");

    const fromStatus = ticket.status;
    const toStatus = dto.toStatus;

    if (fromStatus === toStatus) {
      throw createHttpError(409, `Ticket is already in status ${toStatus}`);
    }

    // Check transition is allowed by Team 6 workflow rules
    const check = await team6Service.canTransition(dto.workflowId, fromStatus, toStatus);
    if (!check.allowed) {
      throw createHttpError(
        409,
        `Workflow does not allow transition from ${fromStatus} to ${toStatus}`,
      );
    }

    ticket.status = toStatus;
    ticket.updatedBy = new Types.ObjectId(dto.userId) as unknown as Types.ObjectId;

    // Stamp resolved / closed timestamps automatically
    if (toStatus === "RESOLVED") ticket.resolvedAt = new Date();
    if (toStatus === "CLOSED") ticket.closedAt = new Date();

    await ticket.save();

    // TODO(Team 7): emit TICKET_STATUS_CHANGED domain event.
    //   eventBus.emit("ticket.statusChanged", { ticketId: ticket._id, tenantId, fromStatus, toStatus });

    return ticket;
  },
};
