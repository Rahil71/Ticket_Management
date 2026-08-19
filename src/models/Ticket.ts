import { Schema, model, Document, Types } from "mongoose";
import { baseFields, baseSchemaOptions } from "../shared/database/base-fields";

// ─── TypeScript Interface ────────────────────────────────────────────────────

export interface ITicket extends Document {
  tenantId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;

  ticketNumber: string;
  requesterId: Types.ObjectId;
  organizationId?: Types.ObjectId;
  contactId?: Types.ObjectId;
  serviceCatalogItemId?: Types.ObjectId;
  assetId?: Types.ObjectId;

  source: "PORTAL" | "EMAIL" | "PHONE" | "CHAT" | "API" | "AGENT";
  subject: string;
  description: string;

  ticketType: "INCIDENT" | "SERVICE_REQUEST" | "QUESTION" | "COMPLAINT";
  categoryId?: Types.ObjectId;
  subcategoryId?: Types.ObjectId;

  status:
    | "NEW"
    | "OPEN"
    | "IN_PROGRESS"
    | "PENDING_CUSTOMER"
    | "PENDING_VENDOR"
    | "ESCALATED"
    | "RESOLVED"
    | "CLOSED"
    | "CANCELLED"
    | "MERGED";

  impact: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  assignedTeamId?: Types.ObjectId;
  assignedAgentId?: Types.ObjectId;
  workflowDefinitionId?: Types.ObjectId;
  workflowVersion?: number;
  slaPolicyId?: Types.ObjectId;

  firstResponseDueAt?: Date;
  resolutionDueAt?: Date;
  firstRespondedAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;

  parentTicketId?: Types.ObjectId;
  mergedIntoTicketId?: Types.ObjectId;

  tags: string[];
  attachmentIds: Types.ObjectId[];
  submittedFields?: Map<string, unknown>;
  customFields?: Map<string, unknown>;

  lastCustomerReplyAt?: Date;
  lastAgentReplyAt?: Date;

  unreadByAgent: boolean;
  unreadByCustomer: boolean;

  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const ticketSchema = new Schema<ITicket>(
  {
    ...baseFields,

    ticketNumber: {
      type: String,
      required: true,
    },

    requesterId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      index: true,
    },

    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
    },

    serviceCatalogItemId: {
      type: Schema.Types.ObjectId,
      ref: "ServiceCatalogItem",
    },

    assetId: {
      type: Schema.Types.ObjectId,
      ref: "Asset",
    },

    source: {
      type: String,
      enum: ["PORTAL", "EMAIL", "PHONE", "CHAT", "API", "AGENT"],
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    description: {
      type: String,
      required: true,
    },

    ticketType: {
      type: String,
      enum: ["INCIDENT", "SERVICE_REQUEST", "QUESTION", "COMPLAINT"],
      default: "INCIDENT",
    },

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ReferenceData",
    },

    subcategoryId: {
      type: Schema.Types.ObjectId,
      ref: "ReferenceData",
    },

    status: {
      type: String,
      enum: [
        "NEW",
        "OPEN",
        "IN_PROGRESS",
        "PENDING_CUSTOMER",
        "PENDING_VENDOR",
        "ESCALATED",
        "RESOLVED",
        "CLOSED",
        "CANCELLED",
        "MERGED",
      ],
      default: "NEW",
      index: true,
    },

    impact: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },

    urgency: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
    },

    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
      index: true,
    },

    assignedTeamId: {
      type: Schema.Types.ObjectId,
      ref: "SupportTeam",
      index: true,
    },

    assignedAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    workflowDefinitionId: {
      type: Schema.Types.ObjectId,
      ref: "WorkflowDefinition",
    },

    workflowVersion: Number,

    slaPolicyId: {
      type: Schema.Types.ObjectId,
      ref: "SlaPolicy",
    },

    firstResponseDueAt: {
      type: Date,
      index: true,
    },

    resolutionDueAt: {
      type: Date,
      index: true,
    },

    firstRespondedAt: Date,
    resolvedAt: Date,
    closedAt: Date,

    parentTicketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
    },

    mergedIntoTicketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
    },

    tags: [String],

    attachmentIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Attachment",
      },
    ],

    submittedFields: {
      type: Map,
      of: Schema.Types.Mixed,
    },

    customFields: {
      type: Map,
      of: Schema.Types.Mixed,
    },

    lastCustomerReplyAt: Date,
    lastAgentReplyAt: Date,

    unreadByAgent: {
      type: Boolean,
      default: false,
    },

    unreadByCustomer: {
      type: Boolean,
      default: false,
    },
  },
  baseSchemaOptions,
);

// ─── Compound Indexes ─────────────────────────────────────────────────────────

ticketSchema.index({ tenantId: 1, ticketNumber: 1 }, { unique: true });
ticketSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
ticketSchema.index({ tenantId: 1, assignedAgentId: 1, status: 1 });
ticketSchema.index({ tenantId: 1, assignedTeamId: 1, status: 1 });
ticketSchema.index({ tenantId: 1, resolutionDueAt: 1, status: 1 });
ticketSchema.index({ tenantId: 1, subject: "text", description: "text" });

// ─── Soft-delete default filter ──────────────────────────────────────────────
ticketSchema.pre(/^find/, function (this: any, next) {
  this.where({ isDeleted: false });
  next();
});

export const TicketModel = model<ITicket>("Ticket", ticketSchema);
