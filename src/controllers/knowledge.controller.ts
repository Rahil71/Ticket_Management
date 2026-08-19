import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { ticketService } from "../services/ticket.service";
import { TicketModel } from "../models/Ticket";

// ─── Knowledge Suggestions Controller ────────────────────────────────────────

/**
 * GET /knowledge/suggestions
 * Returns knowledge article suggestions for the current customer (INT-US-006, SCR-3.2).
 *
 * Behaviour:
 *  - When `subject` or `category` is supplied: performs a full-text / category
 *    search across ALL tickets for the tenant (not scoped to the customer) so
 *    that pre-submission suggestions match a broad knowledge base.  This is the
 *    primary "before submission" flow described in INT-US-006.
 *  - When neither parameter is supplied: falls back to the customer's own 5
 *    most-recently-updated tickets as contextual suggestions.
 *  - When `deflection=true` is sent: records that the customer viewed a
 *    suggestion instead of submitting (AC: deflection is recorded).
 *
 * Query parameters:
 *   subject    — partial text matched against ticket subjects
 *   category   — category ObjectId to narrow suggestions
 *   deflection — pass "true" to record a deflection event (INT-US-006 AC)
 *
 * Note: When Team 8 delivers a dedicated knowledge-base service, replace the
 * ticket-based matching below with an HTTP call to their endpoint and proxy the
 * response back.  The route, auth guards, and deflection logic stay here.
 *
 * TODO(Team 8): swap TicketModel search below with a call to Team 8's knowledge
 * endpoint once the integration contract is agreed.
 */
export const getKnowledgeSuggestions = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const customerId: string = res.locals.customerId;
    const tenantId: string = res.locals.tenantId;

    // Guard: customerId must be present — suggestions are always customer-scoped
    if (!customerId) {
      res.status(401).json({ success: false, message: "Customer identity required" });
      return;
    }

    const subject = (req.query.subject as string | undefined)?.trim();
    const category = (req.query.category as string | undefined)?.trim();
    const deflection = req.query.deflection === "true";

    let matchingTickets: Array<{ _id: unknown; subject: string; categoryId?: unknown }>;

    if (subject || category) {
      // Route through ticketService.list for filtered queries when possible.
      // For full-text ($text) or categoryId filtering we need a direct projection
      // that ticketService.list doesn't currently expose, so we use the service
      // for the scoped list and build a minimal projection here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filter: Record<string, any> = {
        tenantId: new Types.ObjectId(tenantId),
      };
      if (subject) {
        filter.$text = { $search: subject };
      }
      if (category && Types.ObjectId.isValid(category)) {
        filter.categoryId = new Types.ObjectId(category);
      }
      matchingTickets = await TicketModel.find(filter)
        .sort({ updatedAt: -1 })
        .limit(5)
        .select("_id subject categoryId")
        .lean();
    } else {
      // No search criteria — use ticketService to get the customer's own recent tickets
      const result = await ticketService.list({
        tenantId,
        requesterId: customerId,
        limit: 5,
      });
      matchingTickets = result.tickets.map((t) => ({
        _id: (t as any)._id,
        subject: t.subject,
        categoryId: t.categoryId,
      }));
    }

    const suggestions = matchingTickets.map((ticket) => ({
      _id: ticket._id,
      title: ticket.subject,
      url: `/knowledge/articles/${(ticket._id as Types.ObjectId).toHexString()}`,
    }));

    // Record deflection: when the customer viewed a suggestion instead of
    // submitting a ticket, store a lightweight audit entry in the ticket's
    // customFields.  This satisfies the INT-US-006 AC "deflection is recorded".
    // TODO(Team 8): replace with a dedicated Deflection collection or Team 8's event
    // endpoint once the integration contract is agreed.
    if (deflection && matchingTickets.length > 0) {
      const deflectedId = matchingTickets[0]._id as Types.ObjectId;
      await TicketModel.findByIdAndUpdate(deflectedId, {
        $set: {
          "customFields.deflectedBy": customerId,
          "customFields.deflectedAt": new Date().toISOString(),
        },
      });
    }

    res.json({ success: true, data: suggestions });
  } catch (err) {
    next(err);
  }
};
