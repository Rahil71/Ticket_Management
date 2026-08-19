import { Request, Response, NextFunction } from "express";

/**
 * Role-based access control middleware.
 *
 * res.locals.userRole is set by the auth/tenant middleware from the JWT claims.
 * Recognised roles (align with Team 1 RBAC):
 *   "ADMIN"    — full access, including form-designer, catalogue management
 *   "AGENT"    — agent-facing ticket operations
 *   "CUSTOMER" — portal-only, read own tickets + reopen
 *
 * In development the tenant.middleware.ts provides a DEV_USER_ROLE env variable.
 * When Team 1's JWT middleware is integrated it must also set res.locals.userRole.
 */

/**
 * Require the caller to have one of the given roles.
 * Returns 403 if the role check fails.
 */
export const requireRole =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const userRole: string = res.locals.userRole ?? "";
    if (!roles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(", ")}`,
      });
      return;
    }
    next();
  };

/**
 * Convenience guard — allow only ADMIN role.
 * Used on: form-schema write operations, service-catalogue write operations,
 * and the Dynamic Request Form Designer (SCR-3.3) which must be hidden from customers.
 */
export const requireAdmin = requireRole("ADMIN");

/**
 * Convenience guard — allow ADMIN or AGENT (not CUSTOMER).
 * Used on: agent-facing ticket routes (POST /tickets, GET /tickets, etc.).
 */
export const requireAgentOrAdmin = requireRole("ADMIN", "AGENT");

/**
 * Convenience guard — allow CUSTOMER, AGENT, or ADMIN.
 * Used on: portal read routes where any authenticated identity is acceptable.
 */
export const requireAnyRole = requireRole("ADMIN", "AGENT", "CUSTOMER");
