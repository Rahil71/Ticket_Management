import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import tenantMiddleware from "./middleware/tenant.middleware";
import errorHandler from "./middleware/error.middleware";

import ticketRoutes from "./routes/ticket.routes";
import attachmentRoutes from "./routes/attachment.routes";
import serviceCatalogRoutes from "./routes/service-catalog.routes";
import formSchemaRoutes from "./routes/form-schema.routes";
import portalRoutes from "./routes/portal.routes";
import knowledgeRoutes from "./routes/knowledge.routes";

const app = express();

// ─── Security & Utility Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

// ─── Serve uploaded files ─────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ─── Dev Tenant / Auth stub ───────────────────────────────────────────────────
// In production, replace tenantMiddleware with Team 1's JWT middleware.
// Both must set res.locals.tenantId, res.locals.userId, res.locals.customerId.
app.use(tenantMiddleware);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", team: "Team 3 — Tickets, Service Catalogue & Portal" });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1/tickets", ticketRoutes);
app.use("/api/v1/attachments", attachmentRoutes);
app.use("/api/v1/service-catalogue", serviceCatalogRoutes);
app.use("/api/v1/form-schemas", formSchemaRoutes);
app.use("/api/v1/portal", portalRoutes);
app.use("/api/v1/knowledge", knowledgeRoutes);

// ─── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Central Error Handler (must be last) ────────────────────────────────────
app.use(errorHandler);

export default app;
