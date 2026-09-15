import { Elysia } from "elysia";

import { keyCloakFederatedAuth } from "../services/keycloak-federated-auth.service";

/**
 * Keycloak federated-auth endpoints (PUBLIC — no Bearer token, no X-Userinfo).
 *
 * Keycloak's User Storage SPI calls these server-to-server, so `authInterceptor`
 * must NOT be applied (same reasoning as the webhook controller): there is no
 * `x-keycloak-signature` and no `Authorization` header on this route.
 *
 * Route: `ALL /api/auth/getDetails/:id` — APISIX strips `/api`.
 * (Declared with `@All` in the source, so every verb is accepted.)
 *
 * CONTRACT IS FROZEN (spec §3 / §6) — the handler returns the RAW Keycloak
 * `UserRepresentation`, NOT the `ResponseModel` envelope, and it maps statuses
 * exactly like the original gateway did:
 *   200 → user object            (lookup OK, or lookup + correct password)
 *   404 → `{ "message": "User not found" }` (service resolved a non-user object)
 *   500 → `{ "message": "Internal server error" }` for EVERYTHING else —
 *         wrong password, unknown user, malformed identifier, DB failure.
 *         (The source microservice threw 422 for bad credentials, but the TCP
 *         client rethrew it, so 422 never reached Keycloak — parity kept.)
 *
 * NO runtime `body`/`params` schema is declared on purpose: Elysia would answer
 * `422` for a body-less call and for a malformed identifier (`%zz`), changing the
 * contract above. Body + path param are documented through `detail` instead, so
 * they still appear in Swagger/the OpenAPI spec.
 */

/** `password || ""` (spec §3.2) — read from the parsed body, GET/HEAD included. */
async function readPassword(body: unknown, request: Request): Promise<string> {
  let parsed = body;

  // Elysia does not parse bodies for GET/HEAD, but the source (`@All` + a JSON
  // body parser) accepted a password there too — read it manually to stay faithful.
  if (parsed === undefined && (request.method === "GET" || request.method === "HEAD")) {
    try {
      const text = await request.text();
      if (text) parsed = JSON.parse(text);
    } catch {
      parsed = undefined; // non-JSON / empty body ⇒ no credential check
    }
  }

  const candidate = (parsed as Record<string, unknown> | undefined)?.password;
  return typeof candidate === "string" ? candidate : "";
}

export const authController = new Elysia().all(
  "/auth/getDetails/:id",
  async ({ params, body, request, set }) => {
    // `password || ""` — an empty/absent password means NO credential check (spec §7.1).
    const password = await readPassword(body, request);

    try {
      const decodedId = decodeURIComponent(params.id as string);
      const result = await keyCloakFederatedAuth(decodedId, password);

      if (result && result.username) {
        return result;
      }

      // Unreachable in practice — kept for parity with the source controller.
      set.status = 404;
      return { message: "User not found" };
    } catch (error) {
      // Every failure collapses here (see the status map above).
      console.error("[keycloak] keyCloakFederatedAuth error:", error);
      set.status = 500;
      return { message: "Internal server error" };
    }
  },
  {
    detail: {
      tags: ["Federated Auth"],
      summary: "Keycloak federated auth — resolve a user by id / username / email",
      description:
        "Called by Keycloak's User Storage SPI. `:id` is URL-encoded and matched " +
        "case-sensitively against `userName`, then `_id`, then `email`. When " +
        "`password` is non-empty it is bcrypt-verified against the local Users " +
        "collection; when it is absent the credential check is skipped. " +
        "Returns the raw Keycloak UserRepresentation (not the standard envelope). " +
        "Public route — no Bearer token / webhook signature.",
      // Documented manually (no runtime validation → no 422 on a body-less call).
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description:
            "URL-encoded identifier: userName, Mongo _id (uuid) or email. " +
            "Matching is case-sensitive.",
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: false, // the source's Swagger said required — it is NOT at runtime
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                password: {
                  type: "string",
                  description:
                    "Plaintext password. Optional: when absent/empty the " +
                    "credential check is skipped entirely.",
                },
              },
              additionalProperties: true,
            },
          },
        },
      },
      responses: {
        "200": { description: "Raw Keycloak user representation" },
        "404": { description: "User not found" },
        "500": { description: "Internal server error" },
      },
    },
  }
);
