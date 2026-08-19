# Team 3 — Thunder Client Testing Guide

## Setup (do this once)

### 1. Install dependencies and run the seed

```bash
cd backend
npm install
npm run seed
```

The seed script will print a block like this — **copy these values**:

```
THUNDER CLIENT ENV VARIABLES:
─────────────────────────────────────────────────
baseUrl          = http://127.0.0.1:5000/api/v1
tenantId         = 665f1a2b3c4d5e6f7a8b9c0d
userId           = 665f1a2b3c4d5e6f7a8b9c0e
customerId       = 665f1a2b3c4d5e6f7a8b9c0f
ticketId         = <real id printed>
resolvedTicketId = <real id printed>
catalogItemId    = <real id printed>
formSchemaId     = <real id printed>
─────────────────────────────────────────────────
```

### 2. Start the dev server

```bash
npm run dev
```

### 3. Create a Thunder Client environment

In VS Code → Thunder Client → Environments → New:

| Variable           | Value (paste from seed output)              |
|--------------------|---------------------------------------------|
| `baseUrl`          | `http://127.0.0.1:5000/api/v1`              |
| `ticketId`         | *(paste from seed output)*                  |
| `resolvedTicketId` | *(paste from seed output)*                  |
| `catalogItemId`    | *(paste from seed output)*                  |
| `formSchemaId`     | *(paste from seed output)*                  |
| `clonedSchemaId`   | *(fill after running clone test)*           |
| `requesterId`      | `665f1a2b3c4d5e6f7a8b9c0f`                  |

### 4. Set `.env` role before testing

Open `backend/.env` and set `DEV_USER_ROLE` to the role needed for each section:

| Testing section             | `DEV_USER_ROLE` value |
|-----------------------------|-----------------------|
| Ticket routes               | `AGENT`               |
| Form schema routes          | `ADMIN`               |
| Service catalogue routes    | `AGENT` or `ADMIN`    |
| Portal / Knowledge routes   | `CUSTOMER`            |
| Attachment routes           | any                   |

Restart the dev server (`npm run dev`) after changing `.env`.

---

## Health Check

```
GET http://127.0.0.1:5000/health
```

Expected response:
```json
{ "status": "ok", "team": "Team 3 — Tickets, Service Catalogue & Portal" }
```

No role required.

---

## Attachment Routes

> **Required role:** Any (`DEV_USER_ROLE=AGENT` is fine)

### Upload an attachment

Upload a file before creating a ticket. The `_id` from the response goes into `attachmentIds`.

> **Note:** Do **not** include an `uploadedBy` field — it is ignored by the server.
> The uploader is always taken from the session token (`DEV_USER_ID`).

```
POST {{baseUrl}}/attachments
Content-Type: multipart/form-data
```

Body → **Form** → type **multipart**:

| Field  | Value                                      |
|--------|--------------------------------------------|
| `file` | *(select any file from disk, e.g. a .png)* |

Expected: `201 Created`

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
    "createdAt": "2025-06-25T10:00:00.000Z"
  }
}
```

> **Save the `_id`** from this response — use it in `attachmentIds` when creating tickets below.

---

### Upload validation error (no file provided)

```
POST {{baseUrl}}/attachments
Content-Type: multipart/form-data
```

*(send an empty form — no file field)*

Expected: `400 Bad Request`

---

### Upload with wrong role (403 test)

Set `DEV_USER_ROLE=` (empty string) in `.env` and restart. Then:

```
POST {{baseUrl}}/attachments
Content-Type: multipart/form-data
```

*(add a file field)*

Expected: `403 Forbidden`

> Restore `DEV_USER_ROLE=AGENT` and restart before continuing.

---

## Ticket Routes

> **Required role:** `AGENT` or `ADMIN` — set `DEV_USER_ROLE=AGENT`

### Create a ticket (PORTAL source — agent files for themselves)

For non-AGENT/PHONE sources, `requesterId` is derived from the session token — do not
include it in the body.

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "PORTAL",
  "subject": "Cannot connect to VPN from home",
  "description": "I have been unable to connect to the corporate VPN since Monday.",
  "ticketType": "INCIDENT",
  "priority": "HIGH",
  "impact": "HIGH",
  "urgency": "HIGH",
  "tags": ["vpn", "remote-work"],
  "attachmentIds": ["665f1a2b3c4d5e6f7a8b9c30"]
}
```

Expected: `201 Created`, `"status": "NEW"`, auto-generated `ticketNumber`,
`"source": "PORTAL"`, `requesterId` matches `DEV_USER_ID`.

---

### Create a ticket (AGENT on behalf of customer — INT-US-005)

For `source: "AGENT"` or `"PHONE"`, supply `requesterId` (the customer's ObjectId)
and optionally `customerName` for display.

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "AGENT",
  "requesterId": "{{requesterId}}",
  "customerName": "Jane Smith",
  "subject": "Customer called — printer on Floor 3 broken",
  "description": "HP printer showing error code E-014. Customer is onsite.",
  "ticketType": "INCIDENT",
  "priority": "LOW",
  "impact": "LOW",
  "urgency": "MEDIUM",
  "tags": ["printer", "phone-call"]
}
```

Expected: `201 Created`, `"source": "AGENT"`, `requesterId` matches `{{requesterId}}`.

---

### Create a ticket (PHONE source — agent files for caller)

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "PHONE",
  "requesterId": "{{requesterId}}",
  "subject": "Customer called — cannot log in to portal",
  "description": "Customer tried three times and gets a 403 error.",
  "ticketType": "INCIDENT",
  "priority": "MEDIUM"
}
```

Expected: `201 Created`, `"source": "PHONE"`.

---

### Create a ticket (SERVICE_REQUEST) — with submitted fields

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "AGENT",
  "requesterId": "{{requesterId}}",
  "subject": "Need access to Jira project",
  "description": "Please grant read access to the DEVOPS-123 Jira project.",
  "ticketType": "SERVICE_REQUEST",
  "priority": "LOW",
  "impact": "LOW",
  "urgency": "LOW",
  "submittedFields": {
    "software_name": "Jira",
    "access_level": "Read Only"
  }
}
```

---

### Validation error — missing required fields

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "PORTAL"
}
```

Expected: `400 Bad Request` with `"errors": [...]` (missing `subject` and `description`).

---

### Validation error — AGENT source without requesterId

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "AGENT",
  "subject": "Missing requesterId",
  "description": "This should fail."
}
```

Expected: `400 Bad Request` — `requesterId is required for AGENT/PHONE source`.

---

### Role error — customer trying to use agent route (403 test)

Set `DEV_USER_ROLE=CUSTOMER` in `.env` and restart, then:

```
POST {{baseUrl}}/tickets
Content-Type: application/json
```

```json
{
  "source": "PORTAL",
  "subject": "Test",
  "description": "Test"
}
```

Expected: `403 Forbidden`

> Restore `DEV_USER_ROLE=AGENT` and restart before continuing.

---

## Service Catalogue Routes

> **Required role:** Any — `DEV_USER_ROLE=AGENT` works

### List all items

```
GET {{baseUrl}}/service-catalogue
```

Expected: `200 OK` — array of all non-deleted catalogue items.

---

### List only ACTIVE items

```
GET {{baseUrl}}/service-catalogue?status=ACTIVE
```

---

### Filter by categoryId

```
GET {{baseUrl}}/service-catalogue?categoryId={{someObjectId}}
```

---

## Form Schema Routes

> **Required role:** `ADMIN` only — set `DEV_USER_ROLE=ADMIN` in `.env` and restart.

### Create a DRAFT form schema

```
POST {{baseUrl}}/form-schemas
Content-Type: application/json
```

```json
{
  "name": "Network Issue Form",
  "code": "NETWORK_ISSUE_V1",
  "fields": [
    {
      "key": "affected_location",
      "label": "Affected Location",
      "type": "SELECT",
      "required": true,
      "options": ["Floor 1", "Floor 2", "Floor 3", "Remote"],
      "displayOrder": 1
    },
    {
      "key": "issue_type",
      "label": "Issue Type",
      "type": "SELECT",
      "required": true,
      "options": ["No internet", "Slow connection", "VPN problem", "Wi-Fi issue"],
      "displayOrder": 2
    },
    {
      "key": "additional_info",
      "label": "Additional Information",
      "type": "TEXTAREA",
      "required": false,
      "displayOrder": 3
    }
  ]
}
```

Expected: `201 Created`, `"status": "DRAFT"`, `"version": 1`

> **Save the `_id`** as `formSchemaId` in your Thunder Client environment.

---

### Create schema with all field types

```
POST {{baseUrl}}/form-schemas
Content-Type: application/json
```

```json
{
  "name": "All Field Types Demo",
  "code": "ALL_FIELDS_DEMO_V1",
  "fields": [
    { "key": "text_field",      "label": "Text",         "type": "TEXT",        "required": true,  "displayOrder": 1 },
    { "key": "textarea_field",  "label": "Textarea",     "type": "TEXTAREA",    "required": false, "displayOrder": 2 },
    { "key": "number_field",    "label": "Number",       "type": "NUMBER",      "required": false, "displayOrder": 3 },
    { "key": "date_field",      "label": "Date",         "type": "DATE",        "required": false, "displayOrder": 4 },
    { "key": "datetime_field",  "label": "Date+Time",    "type": "DATETIME",    "required": false, "displayOrder": 5 },
    { "key": "select_field",    "label": "Select",       "type": "SELECT",      "required": true,  "options": ["A","B","C"], "displayOrder": 6 },
    { "key": "multisel_field",  "label": "Multi Select", "type": "MULTISELECT", "required": false, "options": ["X","Y","Z"], "displayOrder": 7 },
    { "key": "checkbox_field",  "label": "Checkbox",     "type": "CHECKBOX",    "required": false, "displayOrder": 8 },
    { "key": "file_field",      "label": "File Upload",  "type": "FILE",        "required": false, "displayOrder": 9 },
    { "key": "customer_field",  "label": "Customer",     "type": "CUSTOMER",    "required": false, "displayOrder": 10 },
    { "key": "asset_field",     "label": "Asset",        "type": "ASSET",       "required": false, "displayOrder": 11 }
  ]
}
```

---

### List all form schemas

```
GET {{baseUrl}}/form-schemas
```

Expected: `200 OK` — array of all non-deleted schemas for the tenant.

---

### Get single form schema

```
GET {{baseUrl}}/form-schemas/{{formSchemaId}}
```

Expected: `200 OK` — full schema with `fields[]` array.

---

### Update a DRAFT form schema (PATCH)

Edit the name or fields of a DRAFT schema. Returns `409` if schema is PUBLISHED.

```
PATCH {{baseUrl}}/form-schemas/{{formSchemaId}}
Content-Type: application/json
```

```json
{
  "name": "Network Issue Form (Updated)",
  "fields": [
    {
      "key": "affected_location",
      "label": "Affected Location",
      "type": "SELECT",
      "required": true,
      "options": ["Floor 1", "Floor 2", "Floor 3", "Floor 4", "Remote"],
      "displayOrder": 1
    },
    {
      "key": "issue_type",
      "label": "Issue Type",
      "type": "SELECT",
      "required": true,
      "options": ["No internet", "Slow connection", "VPN problem", "Wi-Fi issue", "DNS issue"],
      "displayOrder": 2
    },
    {
      "key": "additional_info",
      "label": "Additional Information",
      "type": "TEXTAREA",
      "required": false,
      "displayOrder": 3
    }
  ]
}
```

Expected: `200 OK`, updated `name` and `fields` in response.

---

### Update error — PUBLISHED schema is immutable

First publish the schema (see below), then try to update it:

```
PATCH {{baseUrl}}/form-schemas/{{formSchemaId}}
Content-Type: application/json
```

```json
{ "name": "Should fail" }
```

Expected: `409 Conflict` — schema is PUBLISHED and cannot be edited.

---

### Publish a form schema

```
POST {{baseUrl}}/form-schemas/{{formSchemaId}}/publish
```

Expected: `200 OK`, `"status": "PUBLISHED"`, `"publishedAt"` set.

---

### Publish error — already published

Publish the same schema again:

```
POST {{baseUrl}}/form-schemas/{{formSchemaId}}/publish
```

Expected: `409 Conflict`

---

### Clone a form schema

Clone a published schema to get a new DRAFT with incremented version.

```
POST {{baseUrl}}/form-schemas/{{formSchemaId}}/clone
```

Expected: `201 Created`, `"status": "DRAFT"`, `"version": 2`, code ends in `_v2`.

> **Save the `_id`** of the cloned schema as `clonedSchemaId` in your environment.

---

### Verify clone is editable (PATCH the clone)

```
PATCH {{baseUrl}}/form-schemas/{{clonedSchemaId}}
Content-Type: application/json
```

```json
{ "name": "Network Issue Form v2" }
```

Expected: `200 OK`.

---

### Form schema — wrong role (403 test)

Set `DEV_USER_ROLE=AGENT` in `.env` and restart, then:

```
GET {{baseUrl}}/form-schemas
```

Expected: `403 Forbidden`

> Restore `DEV_USER_ROLE=ADMIN` and restart before continuing.

---

## Customer Portal Routes

> **Required role:** Any — but controllers require `customerId` to be set.
> Set `DEV_USER_ROLE=CUSTOMER` in `.env` and restart.
> Ensure `DEV_CUSTOMER_ID` is set to the seeded customer ObjectId.

### Portal dashboard

```
GET {{baseUrl}}/portal/dashboard
```

Expected: summary counts + 5 most recent tickets for the customer.

```json
{
  "success": true,
  "data": {
    "summary": { "open": 2, "resolved": 1, "total": 3 },
    "recentTickets": [...]
  }
}
```

---

### Customer's own ticket list

```
GET {{baseUrl}}/portal/tickets
```

Expected: paginated list with customer-safe ticket shape (no `assignedAgentId`,
no `assignedTeamId`, no raw `customFields`).

---

### Filter portal tickets by status

```
GET {{baseUrl}}/portal/tickets?status=OPEN
```

---

### Filter portal tickets by page

```
GET {{baseUrl}}/portal/tickets?page=1&limit=5
```

---

### Get portal ticket detail

```
GET {{baseUrl}}/portal/tickets/{{resolvedTicketId}}
```

Expected: customer-safe shape. Verify these fields are **absent**: `assignedAgentId`,
`assignedTeamId`, `slaPolicyId`, `workflowDefinitionId`, `customFields`, `isDeleted`.

---

### Submit new request from portal (INT-US-001) — with attachment

Upload a file first (see Attachment Routes), then include its `_id` in `attachmentIds`.

> `requesterId` and `source` must **not** be in the body — they are set server-side.

```
POST {{baseUrl}}/portal/tickets
Content-Type: application/json
```

```json
{
  "subject": "Request access to SharePoint Marketing site",
  "description": "I need read access to the Marketing SharePoint site for the Q3 campaign.",
  "ticketType": "SERVICE_REQUEST",
  "tags": ["sharepoint", "access"],
  "attachmentIds": ["665f1a2b3c4d5e6f7a8b9c30"]
}
```

Expected: `201 Created`, `"source": "PORTAL"`, `requesterId` matches `DEV_CUSTOMER_ID`,
response is customer-safe shape.

---

### Submit with serviceCatalogItemId — form schema validation triggers

```
POST {{baseUrl}}/portal/tickets
Content-Type: application/json
```

```json
{
  "subject": "Hardware request",
  "description": "I need a new laptop.",
  "serviceCatalogItemId": "{{catalogItemId}}",
  "submittedFields": {
    "asset_type": "Laptop",
    "justification": "Current laptop is 5 years old"
  }
}
```

Expected: `201 Created` if fields are valid; `422 Unprocessable` if required fields are missing.

---

### Form schema validation error (422 test)

```
POST {{baseUrl}}/portal/tickets
Content-Type: application/json
```

```json
{
  "subject": "Hardware request missing fields",
  "description": "Missing required submittedFields.",
  "serviceCatalogItemId": "{{catalogItemId}}",
  "submittedFields": {}
}
```

Expected: `422 Unprocessable Entity` — `"Missing required fields: asset_type, justification"`
(exact message depends on what the linked schema requires).

---

### Customer reopen ticket (INT-US-004)

```
POST {{baseUrl}}/portal/tickets/{{resolvedTicketId}}/replies/reopen
Content-Type: application/json
```

```json
{
  "reason": "The access was revoked again the next morning after it was granted."
}
```

Expected: `200 OK`, `"status": "OPEN"`, `"reopenReason"` set.

---

### Portal reopen without reason (validation error)

```
POST {{baseUrl}}/portal/tickets/{{resolvedTicketId}}/replies/reopen
Content-Type: application/json
```

```json
{}
```

Expected: `400 Bad Request` — `"reason is required"`.

---

### Portal reopen — wrong ticket (403 test)

Use a ticket ObjectId that belongs to a different customer:

```
POST {{baseUrl}}/portal/tickets/000000000000000000000001/replies/reopen
Content-Type: application/json
```

```json
{ "reason": "Test" }
```

Expected: `404` (ticket not found) or `403` (if the ticket exists but belongs to another customer).

---

### Portal reopen — reopen window expired (409 test)

Set `REOPEN_WINDOW_DAYS=0` in `.env` and restart (or use a ticket whose `closedAt` is older
than the configured window), then:

```
POST {{baseUrl}}/portal/tickets/{{resolvedTicketId}}/replies/reopen
Content-Type: application/json
```

```json
{ "reason": "Test" }
```

Expected: `409 Conflict` — reopen window has expired.

> Restore `REOPEN_WINDOW_DAYS=30` and restart.

---

## Knowledge Suggestions Routes

> **Required role:** Any, but controller requires `customerId`.
> Set `DEV_USER_ROLE=CUSTOMER` and ensure `DEV_CUSTOMER_ID` is set.

### Suggestions by subject — pre-submission (INT-US-006)

Searches across **all tenant tickets** matching the subject text (customer has not yet
submitted a ticket — SCR-3.2 use case).

```
GET {{baseUrl}}/knowledge/suggestions?subject=VPN
```

Expected: `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "title": "Cannot connect to VPN from home",
      "url": "/knowledge/articles/..."
    }
  ]
}
```

---

### Suggestions with deflection recording (INT-US-006 AC)

Passing `deflection=true` records that the customer chose an article instead of submitting.

```
GET {{baseUrl}}/knowledge/suggestions?subject=VPN&deflection=true
```

Expected: `200 OK` — same shape as above; first result's ticket `customFields` will contain
`deflectedBy` and `deflectedAt`.

---

### Suggestions with no filters (customer's own recent tickets)

When neither `subject` nor `category` is provided, falls back to the current customer's
5 most-recently-updated tickets.

```
GET {{baseUrl}}/knowledge/suggestions
```

Expected: `200 OK` — up to 5 tickets belonging to `DEV_CUSTOMER_ID`.

---

### Suggestions filtered by category ObjectId

```
GET {{baseUrl}}/knowledge/suggestions?category={{someObjectId}}
```

Expected: `200 OK` — results restricted to tickets in that category.

---

## Common Error Scenarios

### 404 — ticket not found

```
GET {{baseUrl}}/portal/tickets/000000000000000000000000
```

Expected: `404 Not Found`

---

### 404 — form schema not found

```
GET {{baseUrl}}/form-schemas/000000000000000000000000
```

Expected: `404 Not Found`
*(requires `DEV_USER_ROLE=ADMIN`)*

---

### 404 — route not found

```
GET {{baseUrl}}/nonexistent-route
```

Expected: `404 Not Found` — `"Route not found"`

---

### 403 — wrong role accessing form schemas

Set `DEV_USER_ROLE=AGENT`, restart, then:

```
POST {{baseUrl}}/form-schemas
Content-Type: application/json
```

```json
{ "name": "Test", "code": "TEST_V1" }
```

Expected: `403 Forbidden`

---

### 422 — submittedFields validation failure

(See the portal section "Form schema validation error" above.)

---

### 409 — duplicate form schema code

Create two schemas with the same `code` (requires `DEV_USER_ROLE=ADMIN`):

```
POST {{baseUrl}}/form-schemas
Content-Type: application/json
```

```json
{ "name": "Duplicate Code Test", "code": "NETWORK_ISSUE_V1" }
```

*(run this twice)*

Expected second call: `409 Conflict` — duplicate key.
