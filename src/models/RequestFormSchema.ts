import { Schema, model, Document, Types } from "mongoose";
import { baseFields, baseSchemaOptions } from "../shared/database/base-fields";

// ─── Field type enum ─────────────────────────────────────────────────────────

export type FormFieldType =
  | "TEXT"
  | "TEXTAREA"
  | "NUMBER"
  | "DATE"
  | "DATETIME"
  | "SELECT"
  | "MULTISELECT"
  | "CHECKBOX"
  | "FILE"
  | "CUSTOMER"
  | "ASSET";

// ─── Embedded field definition ────────────────────────────────────────────────

export interface IFormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  defaultValue?: unknown;
  options?: unknown[];
  validation?: unknown;
  visibilityCondition?: unknown;
  displayOrder: number;
}

// ─── TypeScript Interface ────────────────────────────────────────────────────

export interface IRequestFormSchema extends Document {
  tenantId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;

  name: string;
  code: string;
  version: number;
  fields: IFormField[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  publishedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const formFieldSubSchema = new Schema<IFormField>(
  {
    key: String,
    label: String,
    type: {
      type: String,
      enum: [
        "TEXT",
        "TEXTAREA",
        "NUMBER",
        "DATE",
        "DATETIME",
        "SELECT",
        "MULTISELECT",
        "CHECKBOX",
        "FILE",
        "CUSTOMER",
        "ASSET",
      ],
    },
    required: Boolean,
    defaultValue: Schema.Types.Mixed,
    options: [Schema.Types.Mixed],
    validation: Schema.Types.Mixed,
    visibilityCondition: Schema.Types.Mixed,
    displayOrder: Number,
  },
  { _id: false },
);

const requestFormSchemaModel = new Schema<IRequestFormSchema>(
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

    version: {
      type: Number,
      required: true,
      default: 1,
    },

    fields: [formFieldSubSchema],

    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
    },

    publishedAt: Date,
  },
  baseSchemaOptions,
);

// Unique code per tenant
requestFormSchemaModel.index({ tenantId: 1, code: 1 }, { unique: true });

// Soft-delete default filter
requestFormSchemaModel.pre(/^find/, function (this: any, next) {
  this.where({ isDeleted: false });
  next();
});

export const RequestFormSchemaModel = model<IRequestFormSchema>(
  "RequestFormSchema",
  requestFormSchemaModel,
);
