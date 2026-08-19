import { Request, Response, NextFunction } from "express";
import { serviceCatalogService } from "../services/service-catalog.service";

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * GET /service-catalogue
 * List catalogue items for the tenant (filter by status, categoryId)
 */
export const listCatalogItems = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const items = await serviceCatalogService.list({
      tenantId: res.locals.tenantId,
      status: req.query.status as string | undefined,
      categoryId: req.query.categoryId as string | undefined,
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};
