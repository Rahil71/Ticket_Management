import { Router } from "express";
import { requireAnyRole } from "../middleware/auth.middleware";
import { getKnowledgeSuggestions } from "../controllers/knowledge.controller";

const router = Router();

// GET /knowledge/suggestions  — article suggestions for a customer (INT-US-006, SCR-3.2)
router.get("/suggestions", requireAnyRole, getKnowledgeSuggestions);

export default router;
