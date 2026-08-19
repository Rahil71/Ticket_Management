import path from "path";
import fs from "fs";
import { Types } from "mongoose";
import { AttachmentModel, IAttachment } from "../models/Attachment";

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export interface CreateAttachmentDTO {
  tenantId: string;
  userId: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
  ticketId?: string;
  uploadedBy?: string;
}

export const attachmentService = {
  async create(dto: CreateAttachmentDTO): Promise<IAttachment> {
    const attachment = await AttachmentModel.create({
      tenantId: new Types.ObjectId(dto.tenantId),
      createdBy: new Types.ObjectId(dto.userId),
      updatedBy: new Types.ObjectId(dto.userId),
      filename: dto.filename,
      originalName: dto.originalName,
      mimetype: dto.mimetype,
      size: dto.size,
      url: dto.url,
      ticketId: dto.ticketId ? new Types.ObjectId(dto.ticketId) : undefined,
      uploadedBy: dto.uploadedBy
        ? new Types.ObjectId(dto.uploadedBy)
        : new Types.ObjectId(dto.userId),
    });
    return attachment;
  },
};
