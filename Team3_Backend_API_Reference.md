# Team 3 — Backend API Reference

> **Base URL (dev):** `http://127.0.0.1:5000/api/v1`
>
> **Auth (dev):** No token required. The dev tenant middleware injects fixed IDs and a role
> from `.env`. When Team 1's JWT middleware is integrated, every request needs:
> `Authorization: Bearer <token>`
>
> The middleware sets `res.locals.tenantId`, `res.locals.userId`, `res.locals.customerId`,
> and `res.locals.userRole`. **None of these values are accepted from the request body.**
> This prevents identity spoofing and impersonation.

---

## Full Route Inventory

| Method  | Path                                        | Role required         | Story        |
|---------|---------------------------------------------|-----------------------|--------------|
| `GET`   | `/health`                                   | None                  | —            |
| `POST`  | `/tickets`                                  | AGENT or ADMIN        | INT-US-001, INT-US-005 |
| `PATCH` | `/tickets/:id/status`                       | AGENT or ADMIN        | INT-US-006 _(Team 6 workflow-gated)_ |
| `POST`  | `/attachments`                              | Any role              | INT-US-001, INT-US-003 |
| `GET`   | `/service-catalogue`                        | Any role              | INT-US-001, INT-US-006 |
| `POST`  | `/form-schemas`                             | ADMIN only            | INT-US-002   |
| `GET`   | `/form-schemas`                             | ADMIN only            | INT-US-002   |
| `GET`   | `/form-schemas/:id`                         | ADMIN only            | INT-US-002   |
| `PATCH` | `/form-schemas/:id`                         | ADMIN only            | INT-US-002   |
| `POST`  | `/form-schemas/:id/publish`                 | ADMIN only            | INT-US-002   |
| `POST`  | `/form-schemas/:id/clone`                   | ADMIN only            | INT-US-002   |
| `GET`   | `/portal/dashboard`                         | Any role + customerId | INT-US-003   |
| `GET`   | `/portal/tickets`                           | Any role + customerId | INT-US-003   |
| `GET`   | `/portal/tickets/:id`                       | Any role + customerId | INT-US-003   |
| `POST`  | `/portal/tickets`                           | Any role + customerId | INT-US-001   |
| `POST`  | `/portal/tickets/:id/replies/reopen`        | Any role + customerId | INT-US-004   |
| `GET`   | `/knowledge/suggestions`                    | Any role + customerId | INT-US-006   |

> **"Any role + customerId"** means the route accepts any authenticated role but the controller
> additionally requires `res.locals.customerId` to be set (returns `401` if absent).

---

## Role-Based Access

| Route group                    | Required role                                            |
|--------------------------------|----------------------------------------------------------|
| `POST /tickets`                | `AGENT` or `ADMIN`                                       |
| `PATCH /tickets/:id/status`    | `AGENT` or `ADMIN`                                       |
| `POST /attachments`            | Any role                                                 |
| `GET /service-catalogue`       | Any role                                                 |
| All `/form-schemas` routes     | `ADMIN` only — SCR-3.3 must be hidden from customers     |
| All `/portal/*` routes         | Any role (controllers also require `customerId`)         |
| `GET /knowledge/*`             | Any role (controllers also require `customerId`)         |

Set `DEV_USER_ROLE` in `.env` to switch roles during development:
- `ADMIN` — access form-designer and catalogue management
- `AGENT` — access agent ticket routes
- `CUSTOMER` — access portal and knowledge routes (also set `DEV_CUSTOMER_ID`)

---

## Response Envelope

Every endpoint returns JSON in one of these shapes:

**Success**
```json
{ "success": true, "data": { ... } }
```

**Paginated list**
```json
{
  "success": true,
  "tickets": [...],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

**Error**
```json
{ "success": false, "message": "Human-readable error" }
```

**Validation error**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "type": "field", "msg": "subject is required and max 250 chars", "path": "subject" }
  ]
}
```

---

## Health Check

| Method | Path      | Description   |
|--------|-----------|---------------|
| GET    | `/health` | Server status |

**Response:**
```json
{ "status": "ok", "team": "Team 3 — Tickets, Service Catalogue & Portal" }
```

---

## Tickets — `/api/v1/tickets`

> **Required role:** `AGENT` or `ADMIN`
> Customers submit tickets via `POST /portal/tickets` instead.

### POST `/tickets` — Create Ticket (Agent/Admin)

**User Stories:** INT-US-001, INT-US-005

**Identity rules (security):**
- `tenantId` and `userId` (createdBy/updatedBy) are always taken from the verified session token — never from the request body.
- For `source: "AGENT"` or `"PHONE"`: `requesterId` must be supplied in the body (the customer the agent is filing on behalf of).
- For all other sources (`PORTAL`, `EMAIL`, `CHAT`, `API`): `requesterId` defaults to the acting user from the session token — do not supply it in the body.

**Team 6 automatic enrichment (happens server-side after validation):**

When a ticket is created, the service automatically calls three Team 6 APIs in sequence
before persisting the ticket. All calls are best-effort — if Team 6 is unreachable the
ticket is still saved using the submitted/default values.

| Step | Team 6 endpoint                        | Input fields              | Fields written to ticket                                |
|------|----------------------------------------|---------------------------|---------------------------------------------------------|
| 1    | `POST /api/priority-matrix/calculate`  | `impact`, `urgency`       | `priority`                                              |
| 2    | `POST /api/assignment-rules/simulate`  | `categoryName`, `customerTier`, `location` | `assignedTeamId`, `assignedAgentId`    |
| 3    | `POST /api/sla-policies/calculate`     | `priority` (resolved)     | `slaPolicyId`, `firstResponseDueAt`, `resolutionDueAt`  |

**Request body:**
```json
{
  "source": "AGENT",
  "requesterId": "665f1a2b3c4d5e6f7a8b9c0f",
  "customerName": "Jane Smith",
  "subject": "Cannot connect to VPN from home",
  "description": "I have been unable to connect since Monday.",
  "ticketType": "INCIDENT",
  "impact": "HIGH",
  "urgency": "CRITICAL",
  "categoryName": "Network",
  "customerTier": "Premium",
  "location": "Dubai",
  "organizationId": null,
  "serviceCatalogItemId": null,
  "assetId": null,
  "categoryId": null,
  "subcategoryId": null,
  "tags": ["vpn", "remote-work"],
  "submittedFields": { "symptom": "Cannot connect" },
  "attachmentIds": ["665f1a2b3c4d5e6f7a8b9c30"]
}
```

**Required fields:** `source`, `subject`, `description`

| Field           | Required when               | Notes                                                       |
|-----------------|-----------------------------|------------------------------------------------------------|
| `source`        | Always                      | See enum below                                             |
| `subject`       | Always                      | Max 250 characters                                         |
| `description`   | Always                      |                                                            |
| `requesterId`   | `source` = AGENT or PHONE   | ObjectId of the customer being served                      |
| `customerName`  | Never (optional)            | Display label only — not stored on ticket                  |
| `impact`        | Optional                    | Input for Team 6 priority calculation                      |
| `urgency`       | Optional                    | Input for Team 6 priority calculation                      |
| `categoryName`  | Optional                    | Free-text category sent to Team 6 assignment simulation    |
| `customerTier`  | Optional                    | Customer tier (from Team 2) for Team 6 assignment matching |
| `location`      | Optional                    | Customer location (from Team 2) for Team 6 matching        |

**`source` enum:** `PORTAL | EMAIL | PHONE | CHAT | API | AGENT`

**`ticketType` enum:** `INCIDENT | SERVICE_REQUEST | QUESTION | COMPLAINT`

**`impact / urgency` enum:** `LOW | MEDIUM | HIGH | CRITICAL`

**`submittedFields` validation:** When `serviceCatalogItemId` is provided and the linked
`ServiceCatalogItem` has a `RequestFormSchema`, the `submittedFields` object is validated
against that schema — missing required fields or unknown keys return HTTP 422.

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c20",
    "ticketNumber": "TKT-9C0D-1717000000000",
    "status": "NEW",
    "source": "AGENT",
    "requesterId": "665f1a2b3c4d5e6f7a8b9c0f",
    "subject": "Cannot connect to VPN from home",
    "description": "I have been unable to connect since Monday.",
    "ticketType": "INCIDENT",
    "impact": "HIGH",
    "urgency": "CRITICAL",
    "priority": "CRITICAL",
    "assignedTeamId": "64f000000000000000000020",
    "slaPolicyId": "64f000000000000000000030",
    "firstResponseDueAt": "2026-08-18T10:15:00.000Z",
    "resolutionDueAt": "2026-08-18T14:00:00.000Z",
    "tags": ["vpn", "remote-work"],
    "attachmentIds": ["665f1a2b3c4d5e6f7a8b9c30"],
    "createdAt": "2025-06-25T10:00:00.000Z",
    "updatedAt": "2025-06-25T10:00:00.000Z"
  }
}
```

**Errors:**
- `400` — validation failed (missing required field; invalid ObjectId; etc.)
- `403` — requires AGENT or ADMIN role
- `422` — `submittedFields` failed form schema validation (missing required field or unknown key)

---

### PATCH `/tickets/:id/status` — Transition Ticket Status (Workflow-Gated)

**User Story:** INT-US-006

**Description:** Changes a ticket's status. Before committing the change, the server calls
Team 6's `POST /api/workflows/:workflowId/can-transition` to confirm the transition is
permitted by the workflow definition attached to the ticket. Returns `409` if blocked.

**Request body:**
```json
{
  "workflowId": "64f000000000000000000010",
  "toStatus": "OPEN"
}
```

| Field        | Required | Notes                                                          |
|--------------|----------|----------------------------------------------------------------|
| `workflowId` | Yes      | The `workflowDefinitionId` stored on the ticket (ObjectId)     |
| `toStatus`   | Yes      | One of the valid status values listed below                    |

**Valid `toStatus` values:** `NEW | OPEN | IN_PROGRESS | PENDING_CUSTOMER | PENDING_VENDOR | ESCALATED | RESOLVED | CLOSED | CANCELLED`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c20",
    "status": "OPEN",
    "updatedAt": "2025-06-25T10:05:00.000Z"
  }
}
```

**Errors:**
- `400` — `workflowId` missing/invalid or `toStatus` not a valid value
- `403` — requires AGENT or ADMIN role
- `404` — ticket not found
- `409` — ticket already in `toStatus`, or Team 6 workflow does not allow the transition

---

## Attachments — `/api/v1/attachments`

> **Required role:** Any authenticated role

### POST `/attachments` — Upload Attachment

**User Stories:** INT-US-001, INT-US-003

Upload a file and receive an attachment record. Pass the returned `_id` in the
`attachmentIds` array when creating a ticket via `POST /tickets` or `POST /portal/tickets`.

**Security:** `uploadedBy` is **always** taken from the verified session token (`res.locals.userId`).
Any `uploadedBy` field in the request body is ignored — this prevents identity spoofing.

**Request:** `multipart/form-data`

| Field      | Type   | Required | Description                                    |
|------------|--------|----------|------------------------------------------------|
| `file`     | File   | Yes      | The file to upload (max 10 MB)                 |
| `ticketId` | string | No       | Associate with an existing ticket after upload |

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c30",
    "filename": "screenshot-1717000000000.png",
    "originalName": "screenshot.png",
    "mimetype": "image/png",
    "size": 204800,
    "url": "/uploads/screenshot-1717000000000.png",
    "uploadedBy": "665f1a2b3c4d5e6f7a8b9c0e",
    "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
    "createdAt": "2025-06-25T10:00:00.000Z",
    "updatedAt": "2025-06-25T10:00:00.000Z"
  }
}
```

**Errors:**
- `400` — no file provided
- `403` — not authenticated (role required)
- `413` — file exceeds 10 MB limit

---

## Service Catalogue — `/api/v1/service-catalogue`

> **Required role:** Any authenticated role
> Write operations (create/update/publish/delete) are admin-only and not yet exposed as routes.

### GET `/service-catalogue` — List Items

**User Story:** INT-US-001, INT-US-006 · **Screen:** SCR-3.2

**Query parameters:**

| Param        | Type   | Description                                |
|--------------|--------|--------------------------------------------|
| `status`     | string | Filter by status: `DRAFT | ACTIVE | INACTIVE` |
| `categoryId` | string | Filter by category ObjectId               |

**Example:** `GET /api/v1/service-catalogue?status=ACTIVE`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c15",
      "name": "Software Access Request",
      "code": "SW_ACCESS_V1",
      "description": "Request access to enterprise software.",
      "requestFormSchemaId": "665f1a2b3c4d5e6f7a8b9c25",
      "status": "ACTIVE",
      "displayOrder": 1
    }
  ]
}
```

---

## Form Schemas — `/api/v1/form-schemas`

> **Required role:** `ADMIN` only
>
> SCR-3.3 (Dynamic Request Form Designer) is admin-only — customers never call these
> endpoints directly. Customers access form fields at portal ticket-creation time when
> the service catalogue item is selected.

### Form Field Sub-Schema

Each entry in `fields[]` has this shape:

| Property            | Type    | Required | Description                                             |
|---------------------|---------|----------|---------------------------------------------------------|
| `key`               | string  | Yes      | Unique identifier used in `submittedFields`             |
| `label`             | string  | Yes      | Display label shown to the user                         |
| `type`              | string  | Yes      | See field type enum below                               |
| `required`          | boolean | Yes      | Whether the field must be filled before ticket submission |
| `defaultValue`      | mixed   | No       | Default value pre-filled in the form                    |
| `options`           | array   | No       | Array of string options (for SELECT / MULTISELECT)      |
| `validation`        | object  | No       | Custom validation rules (e.g. min/max for NUMBER)       |
| `visibilityCondition` | object | No      | Conditional display logic                               |
| `displayOrder`      | number  | Yes      | Sort order in the rendered form                         |

**`type` enum:**
`TEXT | TEXTAREA | NUMBER | DATE | DATETIME | SELECT | MULTISELECT | CHECKBOX | FILE | CUSTOMER | ASSET`

---

### POST `/form-schemas` — Create DRAFT Schema

**User Story:** INT-US-002

**Request body:**
```json
{
  "name": "Hardware Request Form",
  "code": "HARDWARE_REQUEST_V1",
  "fields": [
    {
      "key": "asset_type",
      "label": "Asset Type",
      "type": "SELECT",
      "required": true,
      "options": ["Laptop", "Monitor", "Keyboard"],
      "displayOrder": 1
    },
    {
      "key": "justification",
      "label": "Business Justification",
      "type": "TEXTAREA",
      "required": true,
      "displayOrder": 2
    },
    {
      "key": "required_by",
      "label": "Required By Date",
      "type": "DATE",
      "required": false,
      "displayOrder": 3
    }
  ]
}
```

**Required fields:** `name`, `code`
**Optional fields:** `fields[]`

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c25",
    "name": "Hardware Request Form",
    "code": "HARDWARE_REQUEST_V1",
    "version": 1,
    "status": "DRAFT",
    "fields": [...],
    "publishedAt": null,
    "tenantId": "665f1a2b3c4d5e6f7a8b9c0d",
    "createdAt": "2025-06-25T10:00:00.000Z",
    "updatedAt": "2025-06-25T10:00:00.000Z"
  }
}
```

**Errors:**
- `400` — missing `name` or `code`
- `403` — requires ADMIN role
- `409` — duplicate `code` for this tenant

---

### GET `/form-schemas` — List All Schemas

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c25",
      "name": "Hardware Request Form",
      "code": "HARDWARE_REQUEST_V1",
      "version": 1,
      "status": "DRAFT",
      "fields": [...],
      "createdAt": "2025-06-25T10:00:00.000Z"
    }
  ]
}
```

**Errors:**
- `403` — requires ADMIN role

---

### GET `/form-schemas/:id` — Get Single Schema

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c25",
    "name": "Hardware Request Form",
    "code": "HARDWARE_REQUEST_V1",
    "version": 1,
    "status": "DRAFT",
    "fields": [
      {
        "key": "asset_type",
        "label": "Asset Type",
        "type": "SELECT",
        "required": true,
        "options": ["Laptop", "Monitor", "Keyboard"],
        "displayOrder": 1
      }
    ],
    "publishedAt": null,
    "createdAt": "2025-06-25T10:00:00.000Z",
    "updatedAt": "2025-06-25T10:00:00.000Z"
  }
}
```

**Errors:**
- `403` — requires ADMIN role
- `404` — schema not found

---

### PATCH `/form-schemas/:id` — Update DRAFT Schema

**User Story:** INT-US-002

Updates `name` and/or `fields` on a DRAFT schema. Returns `409` if the schema is
`PUBLISHED` — published schemas are immutable. Clone first to create a new editable version.

**Request body** (all fields optional):
```json
{
  "name": "Updated Hardware Request Form",
  "fields": [
    {
      "key": "asset_type",
      "label": "Asset Type",
      "type": "SELECT",
      "required": true,
      "options": ["Laptop", "Monitor", "Keyboard", "Mouse"],
      "displayOrder": 1
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c25",
    "name": "Updated Hardware Request Form",
    "version": 1,
    "status": "DRAFT",
    "fields": [...],
    "updatedAt": "2025-06-25T11:00:00.000Z"
  }
}
```

**Errors:**
- `400` — `fields` is not an array or `name` is not a string
- `403` — requires ADMIN role
- `404` — schema not found
- `409` — schema is `PUBLISHED` and cannot be edited (clone it first)

---

### POST `/form-schemas/:id/publish` — Publish Schema

**User Story:** INT-US-002

Sets `status: "PUBLISHED"` and records `publishedAt`. Once published, the schema is
immutable — use `POST /:id/clone` to create a new editable version.

**Request body:** *(empty)*

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c25",
    "name": "Hardware Request Form",
    "version": 1,
    "status": "PUBLISHED",
    "publishedAt": "2025-06-25T12:00:00.000Z"
  }
}
```

**Errors:**
- `403` — requires ADMIN role
- `404` — schema not found
- `409` — already published, or schema is ARCHIVED

---

### POST `/form-schemas/:id/clone` — Clone Schema

**User Story:** INT-US-002

Creates a new DRAFT schema copied from the source (any status). The clone gets:
- `version` incremented by 1
- `code` suffixed with `_v{n}` (e.g. `HARDWARE_REQUEST_V1` → `HARDWARE_REQUEST_V1_v2`)
- `status: "DRAFT"` and `publishedAt: null`
- A new `_id`

Typically used when you need to edit a published schema.

**Request body:** *(empty)*

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c26",
    "name": "Hardware Request Form (copy)",
    "code": "HARDWARE_REQUEST_V1_v2",
    "version": 2,
    "status": "DRAFT",
    "fields": [...],
    "publishedAt": null,
    "createdAt": "2025-06-25T13:00:00.000Z"
  }
}
```

**Errors:**
- `403` — requires ADMIN role
- `404` — source schema not found

---

## Customer Portal — `/api/v1/portal`

> **Required role:** Any authenticated role
> The controllers additionally require `res.locals.customerId` to be set (returns `401` if absent).
> Customers can only see and modify **their own** tickets.
>
> **Customer-safe response shape:** All portal endpoints strip the following internal fields
> before returning a ticket: `assignedAgentId`, `assignedTeamId`, `slaPolicyId`,
> `workflowDefinitionId`, `workflowVersion`, `firstResponseDueAt`, `firstRespondedAt`,
> `customFields` (raw audit map), `isDeleted`, `version`.
> Only `reopenReason` and `slaResolutionDueAt` are re-exposed from internal state.
>
> **SCR-3.3 (Form Designer) is NOT available here** — it lives behind `requireAdmin`
> in `/form-schemas` routes only.

---

### GET `/portal/dashboard` — Dashboard Summary

**User Story:** INT-US-003 · **Screen:** SCR-3.4

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "summary": {
      "open": 2,
      "resolved": 5,
      "total": 8
    },
    "recentTickets": [
      {
        "_id": "665f1a2b3c4d5e6f7a8b9c20",
        "ticketNumber": "TKT-9C0D-1717000000000",
        "subject": "Cannot connect to VPN",
        "status": "OPEN",
        "priority": "HIGH",
        "source": "PORTAL",
        "createdAt": "2025-06-25T10:00:00.000Z"
      }
    ]
  }
}
```

**Errors:**
- `401` — customer identity required (`customerId` not set)
- `403` — role not recognised

---

### GET `/portal/tickets` — My Tickets

**User Story:** INT-US-003 · **Screen:** SCR-3.4

**Query parameters:**

| Param    | Type    | Description                                     |
|----------|---------|-------------------------------------------------|
| `status` | string  | Filter by status enum value (e.g. `OPEN`)       |
| `page`   | integer | Page number (default: 1)                        |
| `limit`  | integer | Results per page (default: 20, max: 100)        |

**Example:** `GET /api/v1/portal/tickets?status=OPEN&page=1&limit=10`

**Response:** `200 OK` — paginated, customer-safe ticket shape
```json
{
  "success": true,
  "tickets": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c20",
      "ticketNumber": "TKT-9C0D-1717000000000",
      "subject": "Cannot connect to VPN",
      "status": "OPEN",
      "priority": "HIGH",
      "source": "PORTAL",
      "tags": ["vpn"],
      "slaResolutionDueAt": "2025-06-26T10:00:00.000Z",
      "createdAt": "2025-06-25T10:00:00.000Z",
      "updatedAt": "2025-06-25T10:00:00.000Z"
    }
  ],
  "total": 8,
  "page": 1,
  "limit": 10
}
```

**Errors:**
- `401` — customer identity required

---

### GET `/portal/tickets/:id` — Ticket Detail

**User Story:** INT-US-003 · **Screen:** SCR-3.5

Returns a customer-safe ticket document. The following fields are **excluded** from the response:
`assignedAgentId`, `assignedTeamId`, `slaPolicyId`, `workflowDefinitionId`, `workflowVersion`,
`firstResponseDueAt`, `firstRespondedAt`, `customFields`, `isDeleted`, `version`.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c20",
    "ticketNumber": "TKT-9C0D-1717000000000",
    "subject": "Cannot connect to VPN",
    "description": "I have been unable to connect since Monday.",
    "status": "RESOLVED",
    "priority": "HIGH",
    "source": "PORTAL",
    "ticketType": "INCIDENT",
    "tags": ["vpn"],
    "attachmentIds": ["665f1a2b3c4d5e6f7a8b9c30"],
    "submittedFields": { "symptom": "Cannot connect" },
    "slaResolutionDueAt": "2025-06-26T10:00:00.000Z",
    "reopenReason": null,
    "resolvedAt": "2025-06-25T15:00:00.000Z",
    "createdAt": "2025-06-25T10:00:00.000Z",
    "updatedAt": "2025-06-25T15:00:00.000Z"
  }
}
```

**Errors:**
- `401` — customer identity required
- `403` — ticket belongs to another customer
- `404` — ticket not found

---

### POST `/portal/tickets` — Submit New Request

**User Story:** INT-US-001 · **Screen:** SCR-3.1

**Security:** `requesterId` is **always** set server-side from `res.locals.customerId` (the
verified token). Do not supply `requesterId` or `source` in the body — they are ignored.
The source is always recorded as `"PORTAL"`.

**Required fields:** `subject`, `description`

**Optional fields:**

| Field                | Type     | Description                                             |
|----------------------|----------|---------------------------------------------------------|
| `serviceCatalogItemId` | ObjectId | Links to a service type; triggers form schema validation |
| `ticketType`         | string   | `INCIDENT | SERVICE_REQUEST | QUESTION | COMPLAINT`     |
| `categoryId`         | ObjectId | Category reference                                      |
| `assetId`            | ObjectId | Associated asset (Team 2)                               |
| `tags`               | string[] | Free-form tags                                          |
| `submittedFields`    | object   | Key/value pairs from the dynamic form (validated against schema) |
| `attachmentIds`      | ObjectId[] | Array of IDs from `POST /attachments`                |

**Response:** `201 Created` — customer-safe ticket shape (same shape as `GET /portal/tickets/:id`)

**Errors:**
- `400` — missing `subject`/`description`; invalid ObjectId in `attachmentIds`
- `401` — customer identity required
- `422` — `submittedFields` failed form schema validation

---

### POST `/portal/tickets/:id/replies/reopen` — Reopen My Ticket

**User Story:** INT-US-004 · **Screen:** SCR-3.5

This is the **only** status-changing action available to customers on the portal.
General status updates are intentionally not exposed — status transitions go through
Team 6's workflow API for agents.

**Reopen window:** Controlled by `REOPEN_WINDOW_DAYS` env variable (default: 30 days).
The ticket must have been resolved/closed within that window. Set `REOPEN_WINDOW_DAYS=0`
to disable the time-window check entirely.

**Request body:**
```json
{ "reason": "The problem has come back after the fix." }
```

**Response:** `200 OK` — customer-safe ticket shape with `status: "OPEN"` and `reopenReason` set
```json
{
  "success": true,
  "data": {
    "_id": "665f1a2b3c4d5e6f7a8b9c20",
    "status": "OPEN",
    "reopenReason": "The problem has come back after the fix.",
    ...
  }
}
```

**Errors:**
- `400` — `reason` is required
- `401` — customer identity required
- `403` — ticket belongs to another customer
- `404` — ticket not found
- `409` — ticket status is not `RESOLVED` or `CLOSED`
- `409` — reopen window has expired (ticket closed more than `REOPEN_WINDOW_DAYS` days ago)

---

## Knowledge Suggestions — `/api/v1/knowledge`

> **Required role:** Any authenticated role
> Controller also requires `res.locals.customerId` to be set (returns `401` if absent).

### GET `/knowledge/suggestions` — Article Suggestions

**User Story:** INT-US-006 · **Screen:** SCR-3.2

**Behaviour:**
- `subject` or `category` provided → full-text / category search across **all tenant tickets** (pre-submission, customer has not yet filed a ticket)
- Neither provided → customer's own 5 most-recently-updated tickets (personalised fallback)
- `deflection=true` → records that the customer chose an article instead of submitting (INT-US-006 AC: deflection is recorded)

**Query parameters:**

| Param        | Type    | Required | Description                                              |
|--------------|---------|----------|----------------------------------------------------------|
| `subject`    | string  | No       | Text matched against ticket subjects (full-text index)   |
| `category`   | string  | No       | Category ObjectId to narrow suggestions                  |
| `deflection` | boolean | No       | `true` — records the deflection event on the first result |

**Example:** `GET /api/v1/knowledge/suggestions?subject=VPN&deflection=true`

**Response:** `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "_id": "665f1a2b3c4d5e6f7a8b9c10",
      "title": "Cannot connect to VPN from home",
      "url": "/knowledge/articles/665f1a2b3c4d5e6f7a8b9c10"
    }
  ]
}
```

**Errors:**
- `401` — `customerId` not present (auth middleware did not set it)

> **Implementation note:** The current implementation derives suggestions from ticket
> subjects. When Team 8 delivers their knowledge-base service, replace with a proxy
> call to their endpoint — the route, auth guards, and deflection logic stay in place.
> See `TODO(Team 8)` comment in `src/controllers/knowledge.controller.ts`.

---

## Error Reference

| HTTP Code | Meaning                                                                    |
|-----------|----------------------------------------------------------------------------|
| 400       | Validation failed — check `errors[]` array in response body                |
| 401       | Customer identity required — `customerId` not set by auth middleware        |
| 403       | Forbidden — wrong role, or customer accessing another customer's ticket     |
| 404       | Resource not found                                                         |
| 409       | Conflict — duplicate key, wrong status for operation, reopen window expired |
| 413       | Payload too large — file exceeds 10 MB upload limit                        |
| 422       | Form schema validation failed — `submittedFields` missing required keys     |
| 500       | Unexpected server error — details logged server-side only                  |

---

## Dev Environment Variables

Stored in `.env` (gitignored). Copy from `.env.example`:

```
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb+srv://admin:admin@expresscluster.3ck47o2.mongodb.net/TMProjectNew
DEV_TENANT_ID=665f1a2b3c4d5e6f7a8b9c0d
DEV_USER_ID=665f1a2b3c4d5e6f7a8b9c0e
DEV_CUSTOMER_ID=665f1a2b3c4d5e6f7a8b9c0f
DEV_USER_ROLE=AGENT
REOPEN_WINDOW_DAYS=30
```

| Variable            | Purpose                                                              |
|---------------------|----------------------------------------------------------------------|
| `DEV_USER_ROLE`     | `ADMIN` to test form-designer routes; `CUSTOMER` to test portal routes; `AGENT` (default) for ticket routes |
| `REOPEN_WINDOW_DAYS`| Days after resolution/closure that a ticket can be reopened (0 = no limit) |

After running `npm run seed`, copy the real MongoDB ObjectIds from the console output
into your Thunder Client environment before testing.

---

## Dev Environment Variables

| Variable              | Default                        | Purpose                                                   |
|-----------------------|--------------------------------|-----------------------------------------------------------|
| `PORT`                | `5000`                         | Express server port                                       |
| `MONGO_URI`           | _(Atlas URI)_                  | MongoDB connection string                                 |
| `DEV_TENANT_ID`       | `665f1a2b3c4d5e6f7a8b9c0d`     | Fixed tenant ObjectId injected by dev middleware          |
| `DEV_USER_ID`         | `665f1a2b3c4d5e6f7a8b9c0e`     | Fixed user ObjectId for dev sessions                      |
| `DEV_CUSTOMER_ID`     | `665f1a2b3c4d5e6f7a8b9c0f`     | Fixed customer ObjectId for portal routes in dev          |
| `DEV_USER_ROLE`       | `AGENT`                        | Active role in dev: `ADMIN \| AGENT \| CUSTOMER`          |
| `REOPEN_WINDOW_DAYS`  | `30`                           | Days after closure that a ticket can be reopened          |
| `TEAM6_API_BASE_URL`  | `http://localhost:5000/api`    | **Team 6 backend base URL.** Update to Render/Vercel URL when Team 6 deploys. |

> **Switching to Team 6's live URL:** Change only `TEAM6_API_BASE_URL` in your `.env` file.
> No code changes are needed. All Team 6 HTTP calls read this variable at runtime.
>
> Example:
> ```env
> TEAM6_API_BASE_URL=https://team6-backend.onrender.com/api
> ```

---

## Integration Notes for Team 1 (Auth)

Replace `src/middleware/tenant.middleware.ts` with Team 1's JWT middleware.
It **must** set all four of:

```ts
res.locals.tenantId   // string — tenant ObjectId
res.locals.userId     // string — acting user ObjectId (agent/admin)
res.locals.customerId // string — customer ObjectId (set for CUSTOMER role only; "" for agents/admins)
res.locals.userRole   // string — "ADMIN" | "AGENT" | "CUSTOMER"
```

No other Team 3 code changes are needed. All controllers and middleware read exclusively
from `res.locals`.

**Security contract:** Team 1 must **never** accept `userRole`, `userId`, `tenantId`, or
`customerId` from the request body or query string. They must always come from the verified
JWT claims only.

---

## Integration Notes for Other Teams

| Team | What they provide to us          | Where we use it                                                         |
|------|----------------------------------|-------------------------------------------------------------------------|
| 1    | JWT → tenantId, userId, userRole | Every request — identity and role enforcement                            |
| 2    | Customer ObjectId as requesterId | `POST /tickets` body (AGENT/PHONE source only)                          |
| 6    | Priority calculation, assignment simulation, SLA deadlines, workflow transitions | Called automatically on ticket create; guarded on status change |
| 8    | Knowledge article suggestions    | `GET /knowledge/suggestions` stub (pending Team 8 delivery)             |

### Team 6 Integration Detail

Team 6 APIs are called from `src/services/ticket.service.ts` via `src/services/team6.service.ts`.

**On ticket creation (`POST /tickets` and `POST /portal/tickets`):**

```
1. POST {TEAM6_API_BASE_URL}/priority-matrix/calculate
   → resolves final priority from impact × urgency
   → saved as ticket.priority

2. POST {TEAM6_API_BASE_URL}/assignment-rules/simulate
   → matches category / customerTier / location against configured rules
   → saves ticket.assignedTeamId and (if returned) ticket.assignedAgentId

3. POST {TEAM6_API_BASE_URL}/sla-policies/calculate
   → calculates SLA deadlines for the resolved priority
   → saves ticket.slaPolicyId, ticket.firstResponseDueAt, ticket.resolutionDueAt
```

**On ticket status change (`PATCH /tickets/:id/status`):**

```
POST {TEAM6_API_BASE_URL}/workflows/:workflowId/can-transition
  { "fromStatus": "<current>", "toStatus": "<requested>" }

→ allowed: true  → status change committed
→ allowed: false → HTTP 409 returned, no change made
```

**Resilience:** All Team 6 calls time out after 5 seconds and fail open for ticket
creation (ticket is saved with defaults) and fail closed for status transitions
(returns 409 to prevent unguarded state changes).
