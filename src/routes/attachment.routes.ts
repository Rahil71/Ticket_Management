import { Router } from "express";
import { requireAnyRole } from "../middleware/auth.middleware";
import { upload, uploadAttachment } from "../controllers/attachment.controller";

const router = Router();

// POST /attachments  — upload a file, get back an attachment record
// Requires any authenticated role. uploadedBy is always taken from the session token.
router.post("/", requireAnyRole, upload.single("file"), uploadAttachment);

export default router;
