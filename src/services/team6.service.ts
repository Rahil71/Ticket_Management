/**
 * team6.service.ts
 *
 * HTTP client wrapper for Team 6's Workflow, Assignment, Priority & SLA APIs.
 *
 * Base URL is read from the TEAM6_API_BASE_URL environment variable.
 * During local development this defaults to http://localhost:5000/api.
 * When Team 6 deploys to Render or Vercel, update the variable in .env:
 *
 *   TEAM6_API_BASE_URL=https://<team6-render-or-vercel-hostname>/api
 *
 * All methods are best-effort: they return null (or false for the transition
 * check) when Team 6 is unreachable or returns an error, so that ticket
 * creation / status changes in Team 3 are never blocked by Team 6 downtime.
 */

// ─── Response types (Team 6 contract) ────────────────────────────────────────

export interface Team6PriorityResult {
  impact: string;
  urgency: string;
  resultingPriority: string;
  priority: string;
}

export interface Team6AssignmentResult {
  matched: boolean;
  matchedRuleId?: string;
  matchedRuleName?: string;
  targetTeamId?: string;
  targetAgentId?: string;
  strategy?: string;
  requiredSkills?: string[];
  reason?: string;
}

export interface Team6SlaResult {
  policyId: string;
  priority: string;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  firstResponseDueAt: string;
  resolutionDueAt: string;
}

export interface Team6TransitionResult {
  allowed: boolean;
  transition: {
    code: string;
    name: string;
    fromStatus: string;
    toStatus: string;
  } | null;
}

// ─── Internal HTTP helper ─────────────────────────────────────────────────────

/**
 * Minimal POST helper using Node's built-in fetch (available since Node 18).
 * Falls back gracefully on network errors — never throws to the caller.
 */
async function post<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const base = (process.env.TEAM6_API_BASE_URL ?? "http://localhost:5000/api").replace(/\/$/, "");
  const url = `${base}${path}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Abort if Team 6 does not respond within 5 seconds
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.warn(
        `[Team6] POST ${path} responded ${response.status} — skipping enrichment.`,
      );
      return null;
    }

    return (await response.json()) as T;
  } catch (err) {
    console.warn(`[Team6] POST ${path} failed: ${(err as Error).message} — skipping enrichment.`);
    return null;
  }
}

// ─── Public service API ───────────────────────────────────────────────────────

export const team6Service = {
  /**
   * Step 1 — Calculate ticket priority from impact × urgency.
   *
   * Called immediately after ticket fields are validated.
   * Returns null when Team 6 is unavailable; caller keeps the default priority.
   *
   * Team 6 endpoint: POST /api/priority-matrix/calculate
   */
  async calculatePriority(
    impact: string,
    urgency: string,
  ): Promise<Team6PriorityResult | null> {
    if (!impact || !urgency) return null;
    return post<Team6PriorityResult>("/priority-matrix/calculate", { impact, urgency });
  },

  /**
   * Step 2 — Simulate assignment rule to get team / agent assignment.
   *
   * Called after category/customer/location fields are resolved.
   * All parameters are optional — Team 6 will match on whatever is supplied.
   * Returns null when Team 6 is unavailable; no assignment is written.
   *
   * Team 6 endpoint: POST /api/assignment-rules/simulate
   */
  async simulateAssignment(params: {
    category?: string;
    customerTier?: string;
    location?: string;
  }): Promise<Team6AssignmentResult | null> {
    // Only call if at least one matching parameter is available
    if (!params.category && !params.customerTier && !params.location) return null;
    return post<Team6AssignmentResult>("/assignment-rules/simulate", params);
  },

  /**
   * Step 3 — Calculate SLA deadlines for the resolved priority.
   *
   * Called after priority has been finalised (either from Team 6 or the default).
   * Returns null when Team 6 is unavailable; no SLA fields are written.
   *
   * Team 6 endpoint: POST /api/sla-policies/calculate
   */
  async calculateSla(priority: string): Promise<Team6SlaResult | null> {
    if (!priority) return null;
    return post<Team6SlaResult>("/sla-policies/calculate", { priority });
  },

  /**
   * Workflow transition guard — check whether a status change is permitted
   * by the workflow definition assigned to the ticket.
   *
   * Called before any ticket status update. When Team 6 is unreachable this
   * returns { allowed: false } to prevent unguarded status changes.
   *
   * Team 6 endpoint: POST /api/workflows/:workflowId/can-transition
   */
  async canTransition(
    workflowId: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<Team6TransitionResult> {
    const result = await post<Team6TransitionResult>(
      `/workflows/${encodeURIComponent(workflowId)}/can-transition`,
      { fromStatus, toStatus },
    );

    // If the call failed, default to NOT allowed (safe fallback)
    return result ?? { allowed: false, transition: null };
  },
};
