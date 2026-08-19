import { Schema, model, Document, Types } from "mongoose";
import { baseFields, baseSchemaOptions } from "../shared/database/base-fields";

// ─── TypeScript Interface ────────────────────────────────────────────────────

export interface IServiceCatalogItem extends Document {
  tenantId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;

  name: string;
  code: string;
  description?: string;
  categoryId?: Types.ObjectId;
  requestFormSchemaId?: Types.ObjectId;
  defaultWorkflowId?: Types.ObjectId;
  defaultSlaPolicyId?: Types.ObjectId;
  defaultTeamId?: Types.ObjectId;
  eligibilityRules?: unknown;
  displayOrder: number;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";

  createdAt: Date;
  updatedAt: Date;
  version: number;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const serviceCatalogItemSchema = new Schema<IServiceCatalogItem>(
  {
    ...baseFields,

    name: {
      type: String,
      required: true,
    },

    code: {
      type: String,
      required: true,
    },

    description: String,

    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "ReferenceData",
    },

    requestFormSchemaId: {
      type: Schema.Types.ObjectId,
      ref: "RequestFormSchema",
    },

    defaultWorkflowId: {
      type: Schema.Types.ObjectId,
      ref: "WorkflowDefinition",
    },

    defaultSlaPolicyId: {
      type: Schema.Types.ObjectId,
      ref: "SlaPolicy",
    },

    defaultTeamId: {
      type: Schema.Types.ObjectId,
      ref: "SupportTeam",
    },

    eligibilityRules: {
      type: Schema.Types.Mixed,
    },

    displayOrder: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "INACTIVE"],
      default: "DRAFT",
    },
  },
  baseSchemaOptions,
);

// Unique code per tenant
serviceCatalogItemSchema.index({ tenantId: 1, code: 1 }, { unique: true });
serviceCatalogItemSchema.index({ tenantId: 1, status: 1, displayOrder: 1 });

// Soft-delete default filter
serviceCatalogItemSchema.pre(/^find/, function (this: any, next) {
  this.where({ isDeleted: false });
  next();
});

export const ServiceCatalogItemModel = model<IServiceCatalogItem>(
  "ServiceCatalogItem",
  serviceCatalogItemSchema,
);
