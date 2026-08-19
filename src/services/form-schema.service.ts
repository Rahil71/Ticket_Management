import { Types } from "mongoose";
import createHttpError from "http-errors";
import {
  RequestFormSchemaModel,
  IRequestFormSchema,
  IFormField,
} from "../models/RequestFormSchema";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateFormSchemaDTO {
  tenantId: string;
  userId: string;
  name: string;
  code: string;
  fields?: IFormField[];
}

export interface UpdateFormSchemaDTO {
  userId: string;
  name?: string;
  fields?: IFormField[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const formSchemaService = {
  async create(dto: CreateFormSchemaDTO): Promise<IRequestFormSchema> {
    const schema = await RequestFormSchemaModel.create({
      tenantId: new Types.ObjectId(dto.tenantId),
      createdBy: new Types.ObjectId(dto.userId),
      updatedBy: new Types.ObjectId(dto.userId),
      name: dto.name,
      code: dto.code,
      fields: dto.fields ?? [],
      status: "DRAFT",
      version: 1,
    });
    return schema;
  },

  async list(tenantId: string): Promise<IRequestFormSchema[]> {
    return RequestFormSchemaModel.find({
      tenantId: new Types.ObjectId(tenantId),
    }).sort({ createdAt: -1 });
  },

  async getById(tenantId: string, schemaId: string): Promise<IRequestFormSchema> {
    const schema = await RequestFormSchemaModel.findOne({
      _id: new Types.ObjectId(schemaId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!schema) throw createHttpError(404, "Form schema not found");
    return schema;
  },

  /** Update fields on a DRAFT schema only (published schemas are immutable — INT-US-002) */
  async update(
    tenantId: string,
    schemaId: string,
    dto: UpdateFormSchemaDTO,
  ): Promise<IRequestFormSchema> {
    const schema = await RequestFormSchemaModel.findOne({
      _id: new Types.ObjectId(schemaId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!schema) throw createHttpError(404, "Form schema not found");
    if (schema.status === "PUBLISHED") {
      throw createHttpError(
        409,
        "Published form schemas are immutable. Clone the schema to create a new version.",
      );
    }

    if (dto.name !== undefined) schema.name = dto.name;
    if (dto.fields !== undefined) schema.fields = dto.fields;
    schema.updatedBy = new Types.ObjectId(dto.userId) as unknown as Types.ObjectId;
    await schema.save();
    return schema;
  },

  /**
   * Publish a DRAFT schema.
   * Sets status to PUBLISHED and records publishedAt.
   * Once published, the schema is immutable (see update() guard above).
   */
  async publish(
    tenantId: string,
    schemaId: string,
    userId: string,
  ): Promise<IRequestFormSchema> {
    const schema = await RequestFormSchemaModel.findOne({
      _id: new Types.ObjectId(schemaId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!schema) throw createHttpError(404, "Form schema not found");
    if (schema.status === "PUBLISHED") throw createHttpError(409, "Already published");
    if (schema.status === "ARCHIVED") {
      throw createHttpError(409, "Archived schemas cannot be published");
    }

    schema.status = "PUBLISHED";
    schema.publishedAt = new Date();
    schema.updatedBy = new Types.ObjectId(userId) as unknown as Types.ObjectId;
    await schema.save();
    return schema;
  },

  /**
   * Clone an existing schema (typically a published one) into a new DRAFT
   * with an incremented version number.
   */
  async clone(
    tenantId: string,
    schemaId: string,
    userId: string,
  ): Promise<IRequestFormSchema> {
    const original = await RequestFormSchemaModel.findOne({
      _id: new Types.ObjectId(schemaId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!original) throw createHttpError(404, "Form schema not found");

    const newSchema = await RequestFormSchemaModel.create({
      tenantId: new Types.ObjectId(tenantId),
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
      name: `${original.name} (copy)`,
      code: `${original.code}_v${original.version + 1}`,
      fields: original.fields,
      status: "DRAFT",
      version: original.version + 1,
    });
    return newSchema;
  },

  async softDelete(tenantId: string, schemaId: string, userId: string): Promise<void> {
    const result = await RequestFormSchemaModel.findOneAndUpdate(
      { _id: new Types.ObjectId(schemaId), tenantId: new Types.ObjectId(tenantId) },
      { $set: { isDeleted: true, updatedBy: new Types.ObjectId(userId) } },
    );
    if (!result) throw createHttpError(404, "Form schema not found");
  },
};
