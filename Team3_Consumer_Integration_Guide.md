# Team 3 — Consumer Integration Guide

> This guide is for **Teams 4, 5, 6, and 7** that depend on Team 3's APIs and data contracts.
>
> **Base URL:** `http://localhost:5000/api/v1`
>
> **Auth:** Every request requires an `Authorization: Bearer <token>` header
> (issued by Team 1). The token determines `tenantId`, `userId`, `customerId`, and
> `userRole`. Team 3 routes enforce role-based access automatically.

> **Team 6 integration status:** Team 3 now calls Team 6 APIs **automatically** on every
> ticket creation. Team 6 no longer needs to patch tickets after creation — priority,
> assignment, and SLA data are resolved server-side during `POST /tickets` and
> `POST /portal/tickets`. Status changes are guarded via `PATCH /tickets/:id/status`.

---

## Contract Summary

```
Team 3 provides to Teams 4, 5, 6, 7:

  Ticket operations:
  - POST   /tickets                                  — agent/admin creates ticket (AGENT|ADMIN)
                                                       ✦ Automatically enriched with Team 6 priority,
                                                         assignment and SLA data on creation
  - PATCH  /tickets/:id/status                       — workflow-gated status transition (AGENT|ADMIN)
                                                       ✦ Calls Team 6 can-transition check before update
  - POST   /portal/tickets                           — customer submits ticket (any + customerId)
                                                       ✦ Same Team 6 auto-enrichment as above
  - GET    /portal/tickets                           — customer's own ticket list (any + customerId)
  - GET    /portal/tickets/:id                       — customer's own ticket detail (any + customerId)
  - POST   /portal/tickets/:id/replies/reopen        — customer reopens ticket (any + customerId)

  Attachments:
  - POST   /attachments                              — upload file (any role)

  Service catalogue:
  - GET    /service-catalogue                        — list service types (any role)

  Form schemas (ADMIN only — not for customer sessions):
  - POST   /form-schemas                             — create DRAFT
  - GET    /form-schemas                             — list all
  - GET    /form-schemas/:id                         — get single
  - PATCH  /form-schemas/:id                         — update DRAFT (immutable when PUBLISHED)
  - POST   /form-schemas/:id/publish                 — publish → immutable
  - POST   /form-schemas/:id/clone                   — clone → new DRAFT with incremented version

  Knowledge suggestions:
  - GET    /knowledge/suggestions                    — pre-submission article suggestions (any + customerId)
```

---

## Ticket Data Shape

The core ticket document that Team 3 stores and serves. Fields marked `[internal]`
are visible only on agent/admin responses — they are stripped from customer portal responses.

```ts
{
  _id:                ObjectId,       // unique ticket id
  ticketNumber:       string,         // e.g. "TKT-9C0D-1717000000000"
  tenantId:           ObjectId,
  requesterId:        ObjectId,       // Customer (Team 2)
  organizationId?:    ObjectId,       // Organization (Team 2)
  contactId?:         ObjectId,       // Contact (Team 2)
  serviceCatalogItemId?: ObjectId,    // ServiceCatalogItem
  assetId?:           ObjectId,       // Asset (Team 2)

  source:             "PORTAL" | "EMAIL" | "PHONE" | "CHAT" | "API" | "AGENT",
  subject:            string,
  description:        string,
  ticketType:         "INCIDENT" | "SERVICE_REQUEST" | "QUESTION" | "COMPLAINT",
  categoryId?:        ObjectId,       // ReferenceData
  subcategoryId?:     ObjectId,

  status:             "NEW" | "OPEN" | "IN_PROGRESS" | "PENDING_CUSTOMER" |
                      "PENDING_VENDOR" | "ESCALATED" | "RESOLVED" | "CLOSED" |
                      "CANCELLED" | "MERGED",
  impact:             "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  urgency:            "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  priority:           "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",

  // [internal] — set by Team 6 via Team 3 PATCH (agents only)
  assignedTeamId?:    ObjectId,       // SupportTeam (Team 1)
  assignedAgentId?:   ObjectId,       // User (Team 1)
  workflowDefinitionId?: ObjectId,    // WorkflowDefinition (Team 6)
  workflowVersion?:   number,
  slaPolicyId?:       ObjectId,       // SlaPolicy (Team 6)

  firstResponseDueAt?: Date,          // set by Team 6
  resolutionDueAt?:   Date,           // set by Team 6
  firstRespondedAt?:  Date,
  resolvedAt?:        Date,
  closedAt?:          Date,

  parentTicketId?:    ObjectId,       // Ticket
  mergedIntoTicketId?: ObjectId,

  tags:               string[],
  attachmentIds:      ObjectId[],     // Attachment (Team 5)
  submittedFields?:   Map<string, unknown>,   // form field values
  customFields?:      Map<string, unknown>,   // [internal] system/audit data

  lastCustomerReplyAt?: Date,         // set by Team 5
  lastAgentReplyAt?:  Date,           // set by Team 5
  unreadByAgent:      boolean,        // set by Team 5
  unreadByCustomer:   boolean,        // set by Team 5

  createdAt:          Date,
  updatedAt:          Date,
  createdBy:          ObjectId,       // acting user at creation time
  updatedBy:          ObjectId,
}
```

---

## Team 4 — Ticket Queue, Search & Saved Views

Team 4 consumes the ticket list to display queues and saved views.

### Fetching Tickets for Queues

```http
GET /api/v1/tickets
```

> **Note:** A list endpoint beyond `GET /portal/tickets` is not yet exposed as a
> general `GET /tickets` route — Team 4 should use the ticket data already pushed
> to their service by Team 3 or request an integration endpoint as an inter-team
> contract.  The fields stored on each ticket (below) are available for filtering.

**Filter fields available on the ticket document:**

| Field             | Type     | Notes                           |
|-------------------|----------|---------------------------------|
| `status`          | enum     | See status values above         |
| `priority`        | enum     | LOW / MEDIUM / HIGH / CRITICAL  |
| `assignedAgentId` | ObjectId | Comes from Team 6 assignment    |
| `assignedTeamId`  | ObjectId | Comes from Team 6 assignment    |
| `requesterId`     | ObjectId | Customer from Team 2            |
| `resolutionDueAt` | Date     | SLA deadline from Team 6        |
| `tenantId`        | ObjectId | Always required as filter       |
| `updatedAt`       | Date     | Default sort                    |

**Assignment data stored on tickets:**
After Team 3 creates a ticket, Team 4/6 write `assignedTeamId`, `assignedAgentId`,
`priority`, `resolutionDueAt`, and `firstResponseDueAt` back onto the ticket (via
PATCH from the agent workspace or Team 6's simulation result).

---

## Team 5 — Ticket Workspace & Collaboration

Team 5 reads ticket details and writes replies, notes, and activities.

### Read a Ticket (Agent View)

Team 5 reads tickets from the agent-facing routes (future `GET /tickets/:id`).
Currently Team 5 should use the ticketId received in Team 4's queue context.

### Ticket Fields Team 5 Reads

| Field                | Use                                            |
|----------------------|------------------------------------------------|
| `status`             | Display in workspace header                    |
| `priority`           | Display in side panel                          |
| `assignedAgentId`    | Current agent assignment                       |
| `assignedTeamId`     | Current team                                   |
| `requesterId`        | Load customer details from Team 2              |
| `lastCustomerReplyAt`| Indicate customer replied                      |
| `lastAgentReplyAt`   | Indicate last agent response                   |
| `unreadByAgent`      | Badge on queue                                 |
| `attachmentIds`      | Load attachments from Team 5's attachment model |
| `submittedFields`    | Show original request form values              |

### Ticket Fields Team 5 Writes Back

Team 5 writes the following fields back onto the ticket after sending a reply:

```json
{
  "lastCustomerReplyAt": "<ISO date>",
  "lastAgentReplyAt":    "<ISO date>",
  "unreadByAgent":       false,
  "unreadByCustomer":    true,
  "firstRespondedAt":    "<ISO date if first reply>"
}
```

These should be written via the existing PATCH ticket endpoint once it is exposed
(currently only the service layer has `update()` — a route will be added).

### Attachment IDs Contract

Team 5 owns the `Attachment` collection. Team 3 stores only the array of ObjectIds
on the ticket (`attachmentIds`). Team 5 hydrates them on the workspace.

---

## Team 6 — Workflow, Assignment, Priority & SLA

Team 6 enrichment is now **fully automated** inside Team 3's ticket creation flow.
Team 6 does not need to manually PATCH tickets after creation.

### How Team 3 Uses Team 6 (Automatic, Server-Side)

When `POST /tickets` or `POST /portal/tickets` is called, Team 3's ticket service
invokes Team 6 in sequence **before** persisting the ticket document:

| Step | Team 6 endpoint                          | Input fields from request body         | Ticket fields populated                               |
|------|------------------------------------------|----------------------------------------|-------------------------------------------------------|
| 1    | `POST /api/priority-matrix/calculate`    | `impact`, `urgency`                    | `priority`                                            |
| 2    | `POST /api/assignment-rules/simulate`    | `categoryName`, `customerTier`, `location` | `assignedTeamId`, `assignedAgentId`               |
| 3    | `POST /api/sla-policies/calculate`       | `priority` (from step 1)               | `slaPolicyId`, `firstResponseDueAt`, `resolutionDueAt` |

**All three calls are best-effort.** If Team 6 is unreachable (timeout > 5 s), the
ticket is still saved with the caller-supplied or default values.

### New Request Body Fields for Team 6 Enrichment

Pass these additional fields in the `POST /tickets` or `POST /portal/tickets` body:

| Field          | Type   | Required | Purpose                                              |
|----------------|--------|----------|------------------------------------------------------|
| `impact`       | enum   | No       | `LOW \| MEDIUM \| HIGH \| CRITICAL` — priority input |
| `urgency`      | enum   | No       | `LOW \| MEDIUM \| HIGH \| CRITICAL` — priority input |
| `categoryName` | string | No       | Free-text category for assignment matching           |
| `customerTier` | string | No       | Customer tier from Team 2 (e.g. `"Premium"`)         |
| `location`     | string | No       | Customer location from Team 2 (e.g. `"Dubai"`)       |

### Workflow-Gated Status Transitions

Status changes are now exposed as a dedicated endpoint that enforces Team 6 workflow
rules before committing the change:

```http
PATCH /api/v1/tickets/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflowId": "64f000000000000000000010",
  "toStatus": "OPEN"
}
```

- `workflowId` is the `workflowDefinitionId` stored on the ticket.
- Team 3 calls `POST /api/workflows/:workflowId/can-transition` on Team 6 before updating.
- Returns `409` if the transition is not allowed.
- Returns `409` if Team 6 is unreachable (fail-closed, to prevent unguarded changes).

### Team 6 Configuration URL

The Team 6 API base URL is configured in Team 3's environment:

```env
# .env
TEAM6_API_BASE_URL=http://localhost:5000/api   # local dev default

# When Team 6 deploys to Render or Vercel:
TEAM6_API_BASE_URL=https://<team6-hostname>/api
```

No code changes are needed when Team 6's URL changes — only the env variable.

---

## Team 7 — Communication, Notifications & Channels

Team 7 listens for domain events from Team 3 to trigger notifications and emails.

### Events Team 3 Will Emit (TODOs — pending event bus integration)

| Event name         | When fired                    | Payload fields                                |
|--------------------|-------------------------------|-----------------------------------------------|
| `ticket.created`   | After `POST /tickets` or `POST /portal/tickets` | `ticketId`, `tenantId`, `requesterId`, `source`, `priority`, `assignedTeamId`, `assignedAgentId` |
| `ticket.reopened`  | After `POST /portal/tickets/:id/replies/reopen` | `ticketId`, `tenantId`, `reason`, `reopenedBy` |

> **Current status:** These events are stubbed as TODO comments in
> `src/services/ticket.service.ts`. Team 7 should raise this as a shared
> concern so the event bus / webhook mechanism can be agreed before Sprint 3.

### Notification Triggers Team 7 Should Handle

| Trigger         | Audience                    | Notes                              |
|-----------------|-----------------------------|------------------------------------|
| Ticket created  | Requesting customer         | Confirmation email (INT-US-001 AC) |
| Ticket reopened | Assigned agent              | Alert to reassign / investigate    |
| SLA warning     | Assigned agent / team lead  | Comes from Team 6 escalation rules |
| SLA breached    | Assigned agent / team lead  | Comes from Team 6 escalation rules |

---

## Ticket Status Reference

| Status            | Description                                    | Who sets it          |
|-------------------|------------------------------------------------|----------------------|
| `NEW`             | Just created, not yet triaged                  | Team 3 on create     |
| `OPEN`            | Acknowledged by agent                          | Team 6 transition    |
| `IN_PROGRESS`     | Active work underway                           | Team 6 transition    |
| `PENDING_CUSTOMER`| Waiting for customer response                  | Team 6 transition    |
| `PENDING_VENDOR`  | Waiting for external vendor                    | Team 6 transition    |
| `ESCALATED`       | Escalated per SLA rule                         | Team 6 transition    |
| `RESOLVED`        | Agent marked resolved                          | Team 6 transition    |
| `CLOSED`          | Auto-closed or manually closed                 | Team 6 transition    |
| `CANCELLED`       | Request withdrawn                              | Team 6 transition    |
| `MERGED`          | Duplicate — merged into another ticket (Team 9)| Team 9              |

**Important:** General status changes are controlled by Team 6 workflow transition rules.
The only status change Team 3 owns directly is `OPEN` (reopen from `RESOLVED`/`CLOSED`
via `POST /portal/tickets/:id/replies/reopen`).

---

## Source Values

| Source   | Set by                               |
|----------|--------------------------------------|
| `PORTAL` | Customer portal — always set server-side, never from body |
| `EMAIL`  | Team 7 email ingest                  |
| `PHONE`  | Agent filing on behalf of caller     |
| `CHAT`   | Future chat channel                  |
| `API`    | External integration                 |
| `AGENT`  | Agent-originated (requires `requesterId` in body) |

---

## Anti-Patterns to Avoid

- **Do not** pass `userId`, `tenantId`, `customerId`, or `requesterId` from the
  client browser — these must come from the verified JWT token only.
- **Do not** use `PATCH /tickets/:id` to change `status` — use Team 6 workflow
  transitions. The update endpoint intentionally does not accept `status`.
- **Do not** call `GET /form-schemas` from a customer session — it returns `403`.
  Form fields are served to customers as part of the service catalogue item, not as
  a raw schema endpoint.
- **Do not** accept `uploadedBy` in the attachment upload body — it is ignored and
  always overridden by the session token.

---

## Questions / Gaps

| Item                       | Status     | Action needed                                     |
|----------------------------|------------|---------------------------------------------------|
| Portal reply/conversation  | Missing    | Confirm with leads: does Team 3 or Team 5 own this? (INT-US-003 AC: "replies available") |
| Domain event bus           | TODO stub  | Agree event bus mechanism with Team 7 before Sprint 3 |
| `GET /tickets/:id` (agent) | Not exposed| Add agent-facing single-ticket read route when Team 5 needs it |
| `GET /tickets` list (agent)| Not exposed| Add paginated agent list route for Team 4 queue consumption |
| Team 10 audit data         | TODO stub  | Domain events feed Team 10 reporting — depends on event bus |
