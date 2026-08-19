import { Types } from "mongoose";
import createHttpError from "http-errors";
import { ServiceCatalogItemModel, IServiceCatalogItem } from "../models/ServiceCatalogItem";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateCatalogItemDTO {
  tenantId: string;
  userId: string;
  name: string;
  code: string;
  description?: string;
  categoryId?: string;
  requestFormSchemaId?: string;
  defaultWorkflowId?: string;
  defaultSlaPolicyId?: string;
  defaultTeamId?: string;
  eligibilityRules?: unknown;
  displayOrder?: number;
}

export interface UpdateCatalogItemDTO {
  userId: string;
  name?: string;
  description?: string;
  categoryId?: string;
  requestFormSchemaId?: string;
  defaultWorkflowId?: string;
  defaultSlaPolicyId?: string;
  defaultTeamId?: string;
  eligibilityRules?: unknown;
  displayOrder?: number;
  status?: IServiceCatalogItem["status"];
}

export interface ListCatalogItemsDTO {
  tenantId: string;
  status?: string;
  categoryId?: string;
  search?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const serviceCatalogService = {
  async create(dto: CreateCatalogItemDTO): Promise<IServiceCatalogItem> {
    const item = await ServiceCatalogItemModel.create({
      tenantId: new Types.ObjectId(dto.tenantId),
      createdBy: new Types.ObjectId(dto.userId),
      updatedBy: new Types.ObjectId(dto.userId),
      name: dto.name,
      code: dto.code,
      description: dto.description,
      categoryId: dto.categoryId ? new Types.ObjectId(dto.categoryId) : undefined,
      requestFormSchemaId: dto.requestFormSchemaId
        ? new Types.ObjectId(dto.requestFormSchemaId)
        : undefined,
      defaultWorkflowId: dto.defaultWorkflowId
        ? new Types.ObjectId(dto.defaultWorkflowId)
        : undefined,
      defaultSlaPolicyId: dto.defaultSlaPolicyId
        ? new Types.ObjectId(dto.defaultSlaPolicyId)
        : undefined,
      defaultTeamId: dto.defaultTeamId
        ? new Types.ObjectId(dto.defaultTeamId)
        : undefined,
      eligibilityRules: dto.eligibilityRules,
      displayOrder: dto.displayOrder ?? 0,
      status: "DRAFT",
    });
    return item;
  },

  async list(dto: ListCatalogItemsDTO): Promise<IServiceCatalogItem[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: Record<string, any> = {
      tenantId: new Types.ObjectId(dto.tenantId),
    };
    if (dto.status) filter.status = dto.status;
    if (dto.categoryId) filter.categoryId = new Types.ObjectId(dto.categoryId);

    const items = await ServiceCatalogItemModel.find(filter).sort({
      displayOrder: 1,
      name: 1,
    });
    return items;
  },

  async getById(tenantId: string, itemId: string): Promise<IServiceCatalogItem> {
    const item = await ServiceCatalogItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!item) throw createHttpError(404, "Service catalogue item not found");
    return item;
  },

  async update(
    tenantId: string,
    itemId: string,
    dto: UpdateCatalogItemDTO,
  ): Promise<IServiceCatalogItem> {
    const update: Record<string, unknown> = {
      updatedBy: new Types.ObjectId(dto.userId),
    };
    const simple: (keyof UpdateCatalogItemDTO)[] = [
      "name",
      "description",
      "displayOrder",
      "status",
      "eligibilityRules",
    ];
    for (const f of simple) {
      if (dto[f] !== undefined) update[f] = dto[f];
    }
    const ids: (keyof UpdateCatalogItemDTO)[] = [
      "categoryId",
      "requestFormSchemaId",
      "defaultWorkflowId",
      "defaultSlaPolicyId",
      "defaultTeamId",
    ];
    for (const f of ids) {
      if (dto[f] !== undefined) {
        update[f] = new Types.ObjectId(dto[f] as string);
      }
    }

    const item = await ServiceCatalogItemModel.findOneAndUpdate(
      { _id: new Types.ObjectId(itemId), tenantId: new Types.ObjectId(tenantId) },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!item) throw createHttpError(404, "Service catalogue item not found");
    return item;
  },

  /** Publish: DRAFT → ACTIVE */
  async publish(tenantId: string, itemId: string, userId: string): Promise<IServiceCatalogItem> {
    const item = await ServiceCatalogItemModel.findOne({
      _id: new Types.ObjectId(itemId),
      tenantId: new Types.ObjectId(tenantId),
    });
    if (!item) throw createHttpError(404, "Service catalogue item not found");
    if (item.status === "ACTIVE") throw createHttpError(409, "Already published");

    item.status = "ACTIVE";
    item.updatedBy = new Types.ObjectId(userId) as unknown as Types.ObjectId;
    await item.save();
    return item;
  },

  async softDelete(tenantId: string, itemId: string, userId: string): Promise<void> {
    const result = await ServiceCatalogItemModel.findOneAndUpdate(
      { _id: new Types.ObjectId(itemId), tenantId: new Types.ObjectId(tenantId) },
      { $set: { isDeleted: true, updatedBy: new Types.ObjectId(userId) } },
    );
    if (!result) throw createHttpError(404, "Service catalogue item not found");
  },
};
