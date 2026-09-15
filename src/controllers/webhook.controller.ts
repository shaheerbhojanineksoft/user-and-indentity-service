import { Elysia, t } from "elysia";

import { constants } from "../config/constants";
import type { KeycloakWebhookDTO } from "../dto/keycloak-webhook.dto";
import { keyCloakWebhook } from "../services/keycloak-webhook.service";
import { verifyWebhookSignature } from "../utils/crypto";

/**
 * Keycloak webhook endpoints (public, server-to-server — no Bearer token).
 * Authenticated via the `x-keycloak-signature` HMAC header (NOT the
 * auth.interceptor — Keycloak does not send a Bearer token / X-Userinfo).
 * Route: /api/auth/keyCloak/webhook  (APISIX strips /api).
 *
 * HOW TO ADD ANOTHER WEBHOOK:
 *   .post("/auth/keyCloak/<event>", handler,
 *        { detail: { tags: ["Webhook"], summary: "..." } })
 */
export const webhookController = new Elysia().post(
  "/auth/keyCloak/webhook",
  async ({ body, headers, set }) => {
    // Signature must be HMAC-SHA256 of the EXACT body JSON, timing-safe.
    const bodyString = typeof body === "string" ? body : JSON.stringify(body);
    const signature = headers["x-keycloak-signature"];

    if (!verifyWebhookSignature(bodyString, signature, constants.KEYCLOAK_WEBHOOK_SECRET)) {
      set.status = 401;
      return { message: "Invalid webhook signature" };
    }

    await keyCloakWebhook(body as KeycloakWebhookDTO);
    return { message: "Webhook received" };
  },
  {
    body: t.Object({}, { additionalProperties: true }),
    detail: {
      tags: ["Webhook"],
      summary: "Keycloak webhook (user signup / events)",
      description:
        "Called by Keycloak when a user registers, logs in, or verifies email. " +
        "Validates the x-keycloak-signature (HMAC-SHA256) before processing.",
    },
  }
);

