import { Schema, model, Document, Types } from "mongoose";
import { baseFields, baseSchemaOptions } from "../shared/database/base-fields";

// ─── TypeScript Interface ─────────────────────────────────────────────────────

export interface IAttachment extends Document {
  tenantId: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  isDeleted: boolean;

  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;

  ticketId?: Types.ObjectId;
  uploadedBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const attachmentSchema = new Schema<IAttachment>(
  {
    ...baseFields,

    filename: {
      type: String,
      required: true,
    },

    originalName: {
      type: String,
      required: true,
    },

    mimetype: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    url: {
      type: String,
      required: true,
    },

    ticketId: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      index: true,
    },

    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  baseSchemaOptions,
);

// Soft-delete default filter — consistent with Ticket.ts and RequestFormSchema.ts
attachmentSchema.pre(/^find/, function (this: any, next) {
  this.where({ isDeleted: false });
  next();
});

export const AttachmentModel = model<IAttachment>("Attachment", attachmentSchema);
