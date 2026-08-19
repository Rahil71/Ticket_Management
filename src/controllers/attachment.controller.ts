import { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import { attachmentService } from "../services/attachment.service";

// ─── Multer storage (disk, uploads/) ─────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, "uploads/");
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /attachments
 * Upload a file and create an attachment record (INT-US-001, INT-US-003)
 */
export const uploadAttachment = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No file provided" });
      return;
    }

    const url = `/uploads/${req.file.filename}`;

    const attachment = await attachmentService.create({
      tenantId: res.locals.tenantId,
      userId: res.locals.userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url,
      ticketId: req.body.ticketId as string | undefined,
      // Security: uploadedBy is always derived from the verified session token.
      // Never accepted from the request body to prevent identity spoofing.
      uploadedBy: res.locals.userId,
    });

    res.status(201).json({ success: true, data: attachment });
  } catch (err) {
    next(err);
  }
};
