import { Elysia } from "elysia";

/**
 * Health endpoints (public — no auth).
 *
 * HOW TO ADD ENDPOINTS HERE:
 *   .get("/ping", () => ({ ... }),
 *        { detail: { tags: ["Health"], summary: "..." } })
 * Controllers stay thin — all business logic lives in src/services/.
 */
export const healthController = new Elysia({ prefix: "/health" }).get(
  "/",
  () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }), 
  {
    detail: {
      tags: ["Health"],
      summary: "Health check",
      description: "Returns service health status and current server time.",
    },
  }
);
 