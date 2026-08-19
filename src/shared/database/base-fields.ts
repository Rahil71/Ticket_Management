import { Schema } from "mongoose";

/**
 * Base fields shared by every Team-3 collection.
 * Spread these into any schema definition: { ...baseFields, ...yourFields }
 */
export const baseFields = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
    index: true,
  },

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
};

/**
 * Standard schema options applied to every Team-3 schema.
 * - timestamps: adds createdAt / updatedAt automatically
 * - versionKey: renames __v to "version"
 * - optimisticConcurrency: prevents lost-update races on save()
 */
export const baseSchemaOptions = {
  timestamps: true,
  versionKey: "version",
  optimisticConcurrency: true,
};
