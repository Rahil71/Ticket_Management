import { Request, Response, NextFunction } from "express";

/**
 * Dev-mode identity stub.
 *
 * In production this is replaced by Team 1's JWT middleware which decodes
 * the bearer token and sets the same locals from the token claims.
 * All property names are kept identical so every controller and middleware
 * works without modification after the swap.
 *
 * res.locals.tenantId   — MongoDB ObjectId string of the current tenant
 * res.locals.userId     — MongoDB ObjectId string of the acting user/agent
 * res.locals.customerId — MongoDB ObjectId string (portal / customer routes only)
 * res.locals.userRole   — Role string: "ADMIN" | "AGENT" | "CUSTOMER"
 *                         Controls access to admin-only routes (form designer, etc.)
 *
 * Team 1 integration checklist:
 *   - Decode JWT and set all four locals above.
 *   - userRole must be one of: ADMIN, AGENT, CUSTOMER (case-sensitive).
 *   - customerId is only required for CUSTOMER role; leave as "" for agents/admins.
 *   - Do NOT accept role or identity overrides from the request body — always
 *     derive from the verified token to prevent impersonation.
 */
const tenantMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.locals.tenantId = process.env.DEV_TENANT_ID ?? "";
  res.locals.userId = process.env.DEV_USER_ID ?? "";
  res.locals.customerId = process.env.DEV_CUSTOMER_ID ?? "";
  // DEV_USER_ROLE controls which role-gated routes are accessible in dev.
  // Set to "ADMIN" to test form-designer and catalogue management endpoints.
  // Set to "AGENT"    to test agent ticket routes.
  // Set to "CUSTOMER" to test portal routes.
  res.locals.userRole = process.env.DEV_USER_ROLE ?? "AGENT";
  next();
};

export default tenantMiddleware;
