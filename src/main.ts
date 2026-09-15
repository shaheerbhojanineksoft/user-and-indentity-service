import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";

import { authController } from "./controllers/auth.controller";
import { userController } from "./controllers/user.controller";
import { webhookController } from "./controllers/webhook.controller";
import { reportedBugController } from "./controllers/reportedBug.controller";
import { notificationPermissionController } from "./controllers/notificationPermission.controller";

/**
 * Main application assembly (like app.js / main.ts in Node.js).
 *
 * CONVENTION — every API lives in a controller under src/controllers/:
 *   - public endpoints   → plain Elysia instance (webhook, federated auth)
 *   - protected endpoints → wrapped with authInterceptor (user)
 * Each controller uses ONE prefix, documents every route with Swagger
 * `detail` (tags + summary), and delegates logic to src/services/.
 */
export const app = new Elysia()
  .use(
    swagger({
      path: "/swagger",
      // Use the classic Swagger UI (like typical Node.js projects)
      // instead of the default Scalar UI.
      provider: "swagger-ui",
      documentation: {
        info: {
          title: "User & Identity Service",
          version: "1.0.0",
          description:
            "API documentation for the User & Identity Service. Swagger UI is available at /swagger and the OpenAPI JSON spec at /swagger/json.",
        },
        tags: [
          {
            name: "Users",
            description: "Authenticated user endpoints (Bearer token required)",
          },
          {
            name: "Webhook",
            description: "Keycloak server-to-server webhooks (HMAC verified)",
          },
          {
            name: "Federated Auth",
            description:
              "Keycloak User Storage SPI endpoints (public — no Bearer token)",
          },
          {
            name: "Reported Bug",
            description: "Authenticated user endpoints for bug tickets (Bearer token required)",
          },
          {
            name: "Notification Permission",
            description: "Authenticated user notification settings (Bearer token required)",
          },
        ],
        // Make Swagger UI's "Try it out" go through the APISIX gateway
        // (the service only trusts APISIX-injected X-Userinfo, not raw JWTs).
        servers: [
          {
            url: "http://localhost:9080/api",
            description: "APISIX Gateway (token verified here)",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description:
                "Keycloak access token. Click the Authorize (lock) button and paste your Bearer token.",
            },
          },
        },
      },
    })
  )
  .get("/", () => ({
    message: "User & Identity Service is running 🚀",
    docs: "/swagger",
    openapi: "/swagger/json",
  }))
  .use(webhookController)  // public — HMAC signature verified (Keycloak webhook)
  .use(authController)     // public — Keycloak User Storage SPI (getDetails/:id)
  .use(userController)     // protected (openid-connect + interceptor)
  .use(reportedBugController) // protected (openid-connect + interceptor)
  .use(notificationPermissionController); // protected (openid-connect + interceptor)

export type App = typeof app;

