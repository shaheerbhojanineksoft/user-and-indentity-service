import { Elysia, t } from "elysia";

import { authInterceptor } from "../interceptors/auth.interceptor";
import {
  getNotificationSetting,
  updateNotificationPermission,
} from "../services/notificationPermission.service";
import type {
  NotificationFlags,
  NotificationPermissionInput,
  ReceiveFromInput,
  SectionNotificationInput,
} from "../dto/notification-permission.dto";

/** Parse the raw JSON body into the LOCKED typed DTO (no `any`). */
function toNotificationPermissionInput(
  body: unknown
): Omit<NotificationPermissionInput, "userId"> {
  const b = (body ?? {}) as Record<string, any>;
  const out: Record<string, any> = {};
  if (b.generalNotification && typeof b.generalNotification === "object") {
    out.generalNotification = b.generalNotification as NotificationFlags;
  }
  if (b.receiveFrom && typeof b.receiveFrom === "object") {
    out.receiveFrom = b.receiveFrom as ReceiveFromInput;
  }
  if (Array.isArray(b.sectionNotifications)) {
    out.sectionNotifications = b.sectionNotifications.filter(
      (x: unknown): x is SectionNotificationInput =>
        x !== null && typeof x === "object"
    );
  }
  return out;
}

/**
 * Protected notification-permission endpoint (Bearer token → APISIX injects
 * X-Userinfo). `authInterceptor` makes `userId` available to the handler and
 * rejects with 401 when the identity header is missing/invalid.
 */
export const notificationPermissionController = authInterceptor(
  new Elysia({ prefix: "/notification-permission" })
).get(
  "/",
  async ({ userId }) => {
    // No logic here — just call the service and return its response.
    return await getNotificationSetting(userId);
  },
  {
    detail: {
      tags: ["Notification Permission"],
      summary: "Get the current user's notification setting",
      description:
        "Returns the authenticated user's notification-permission document " +
        "(auto-creates the default on first access). No body/query.",
      security: [{ bearerAuth: [] }],
    },
  }
)
.put(
  "/",
  async ({ body, userId }) => {
    const input: NotificationPermissionInput = {
      ...toNotificationPermissionInput(body),
      userId, // server-set
    };
    // No logic here — just call the service and return its response.
    return await updateNotificationPermission(input, userId);
  },
  {
    body: t.Object(
      {
        generalNotification: t.Optional(
          t.Object(
            {
              pushNotification: t.Optional(t.Boolean()),
              emailNotification: t.Optional(t.Boolean()),
              smsNotification: t.Optional(t.Boolean()),
              appNotification: t.Optional(t.Boolean()),
            },
            { additionalProperties: true }
          )
        ),
        receiveFrom: t.Optional(
          t.Object(
            {
              friends: t.Optional(t.Boolean()),
              followers: t.Optional(t.Boolean()),
              public: t.Optional(t.Boolean()),
            },
            { additionalProperties: true }
          )
        ),
        sectionNotifications: t.Optional(t.Array(t.Any())),
      },
      { additionalProperties: true }
    ),
    detail: {
      tags: ["Notification Permission"],
      summary: "Update the current user's notification permission",
      description:
        "Merges the incoming setting fields into the user's notification " +
        "permission doc (sectionNotifications merged by key). userId is " +
        "server-set. No FCM side-effect.",
      security: [{ bearerAuth: [] }],
    },
  }
);
