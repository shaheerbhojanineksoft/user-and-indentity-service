import { Elysia, t } from "elysia";

import type { CreateReportedBugInput } from "../dto/create-reported-bug.dto";
import type { GetReportedBugTicketsQuery } from "../dto/get-reported-bug-tickets.dto";
import { authInterceptor } from "../interceptors/auth.interceptor";
import {
  addReportedBug,
  getReportedBugTickets,
} from "../services/reportedBug.service";

/** Parse the raw JSON body into the LOCKED typed DTO (no `any`). */
function toCreateReportedBugInput(body: unknown): CreateReportedBugInput {
  const b = (body ?? {}) as Partial<CreateReportedBugInput>;
  return {
    title: typeof b.title === "string" ? b.title : "",
    description: typeof b.description === "string" ? b.description : "",
    mediaUrl: Array.isArray(b.mediaUrl)
      ? b.mediaUrl.filter((x): x is string => typeof x === "string")
      : [],
    page: typeof b.page === "string" ? b.page : "",
    section: typeof b.section === "string" ? b.section : "",
  };
}

/**
 * Protected reported-bug endpoint (Bearer token → APISIX injects X-Userinfo).
 * `authInterceptor` makes `userId` available to the handler (used as the bug's
 * ownerId) and rejects with 401 when the identity header is missing/invalid.
 */
export const reportedBugController = authInterceptor(
  new Elysia({ prefix: "/reported-bug" })
).post(
  "/",
  async ({ body, userId }) => {
    // No logic here — just call the service and return its response.
    return await addReportedBug(toCreateReportedBugInput(body), userId);
  },
  {
    body: t.Object(
      {
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        mediaUrl: t.Optional(t.Array(t.String())),
        page: t.Optional(t.String()),
        section: t.Optional(t.String()),
      },
      { additionalProperties: true }
    ),
    detail: {
      tags: ["Reported Bug"],
      summary: "Add a reported bug",
      description:
        "Creates a reported bug ticket for the authenticated user with " +
        "status PENDING and ownerId = current user id. No notification or " +
        "helpdesk/slack side-effects.",
      security: [{ bearerAuth: [] }],
    },
  }
)
.get(
  "/",
  async ({ query, userId }) => {
    const q = query as Record<string, string | undefined>;
    // Parse numeric query params from their raw string form (no `any`).
    const parsedPage = Number(q.page ?? "1");
    const parsedPageSize = Number(q.pageSize ?? "10");
    const input: GetReportedBugTicketsQuery = {
      page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
      pageSize:
        Number.isFinite(parsedPageSize) && parsedPageSize > 0 ? parsedPageSize : 10,
    };
    // No logic here — just call the service and return its response.
    return await getReportedBugTickets(input.page, input.pageSize, userId);
  },
  {
    query: t.Object(
      {
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
      },
      { additionalProperties: true }
    ),
    detail: {
      tags: ["Reported Bug"],
      summary: "Get the current user's reported bug tickets",
      description:
        "Paginated list of the authenticated user's own reported bugs, sorted " +
        "by createdOn desc. page (1-based) and pageSize are optional query " +
        "params; defaults 1 and 10.",
      security: [{ bearerAuth: [] }],
    },
  }
);
