import { Elysia, t } from "elysia";

import type { UpdateConfiguration } from "../dto/update-configuration.dto";
import type { UpdateProfileDTO } from "../dto/update-profile.dto";
import { authInterceptor } from "../interceptors/auth.interceptor";
import {
  deleteAccount,
  generateUsername,
  getUserById,
  getUsername,
  me,
  recreateAccount,
  updateConfiguration,
  updateProfile,
  updateUserProfile,
} from "../services/user.service";

/**
 * Protected user endpoints (Bearer token → APISIX injects X-Userinfo).
 * `authInterceptor` makes `userId` available to every handler and rejects
 * with 401 when the identity header is missing/invalid — same as the source's
 * inline derive, but more robust (also accepts plain JSON, never 500s).
 *
 * HOW TO ADD A PROTECTED ENDPOINT HERE:
 *   .get("/profile", async ({ userId }) => me(userId),
 *        { detail: { tags: ["Users"], summary: "...", security: [{ bearerAuth: [] }] } })
 */
export const userController = authInterceptor(
  new Elysia({ prefix: "/users" })
)
  .get(
    "/me",
    async ({ userId }) => {
      // No logic here — just call the service and return its response.
      return await me(userId);
    },
    {
      detail: {
        tags: ["Users"],
        summary: "Get the current user's full profile",
        description:
          "Returns the full user document from the Users collection for the authenticated user.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  .get(
    "/byId/:id",
    async ({ params, userId }) => {
      // No logic here — just call the service and return its response.
      return await getUserById(params.id, userId);
    },
    {
      params: t.Object({ id: t.String() }),
      detail: {
        tags: ["Users"],
        summary: "Get a user's profile by id (with relationship flags)",
        description:
          "Returns the viewed user's profile with isFollowing / isFriend / " +
          "isRequestSent / isBlocked flags and socialConnections.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  .put(
    "/",
    async ({ body, set, userId }) => {
      try {
        // No logic here — just call the service and return its response.
        return await updateProfile(body as Record<string, any>, userId);
      } catch {
        set.status = 500;
        return { statusCode: 500, message: "Something Went Wrong." }; // HttpException-style body
      }
    },
    {
      body: t.Object(
        {
          userName: t.Optional(t.String()),
          fullName: t.Optional(t.String()),
          coverPhoto: t.Optional(t.String()),
          profilePicture: t.Optional(t.String()),
          country: t.Optional(t.String()),
          gender: t.Optional(t.String()),
          // REQUIRED (validated in the service so the error stays a standard
          // isSuccess:false envelope instead of Elysia's 422).
          age: t.Optional(
            t.Union([t.Number(), t.String()], {
              description: "Required. Number (or numeric string); stored as a number.",
            })
          ),
          theme: t.Optional(t.String()),
          experience: t.Optional(t.String()),
          // Required only while age < 18 (guardian consent); optional at 18+.
          parentalEmail: t.Optional(t.String()),
          // Gate for the founder auto-follow: on every hit of this endpoint we
          // check that the value stored on the user doc is NOT already true and
          // that this request brings it true — only then are the FOUNDER_IDS
          // (+ the affiliate referrer) followed.
          isFavouriteInvestmentCompleted: t.Optional(t.Boolean()),
        },
        { additionalProperties: true }
      ),
      detail: {
        tags: ["Users"],
        summary: "Update the current user's profile",
        description:
          "Updates the profile fields and, if the userName changed, also updates it in " +
          "Keycloak. country, age, theme and experience are REQUIRED; parentalEmail is " +
          "required only when age is below 18. On a missing/invalid field the response " +
          "is { isSuccess: false, message: \"<field> is required\", data: {} }. On the " +
          "FIRST completion (flag false in Mongo + isFavouriteInvestmentCompleted true " +
          "in the body) the FOUNDER_IDS env ids and the affiliate referrer are " +
          "auto-followed.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Static route — register before any dynamic /:username route (spec note).
  .get(
    "/username/generate/:fullName",
    async ({ params }) => {
      // No logic here — just call the service and return its response.
      return await generateUsername(params.fullName);
    },
    {
      params: t.Object({ fullName: t.String() }),
      detail: {
        tags: ["Users"],
        summary: "Generate a unique username from a full name",
        description:
          "Slugifies the full name and returns an available username " +
          "(base, base-1, base-2, then timestamp variants).",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  // Dynamic route — AFTER the static generate route (spec note).
  .get(
    "/:username/username",
    async ({ params, userId }) => {
      // No logic here — just call the service and return its response.
      return await getUsername(params.username, userId);
    },
    {
      params: t.Object({ username: t.String() }),
      detail: {
        tags: ["Users"],
        summary: "Get a user's profile by username (with relationship flags)",
        description:
          "Returns the user's profile with isFollowing / isFriend / isRequestSent / " +
          "isBlocked flags, profileConfiguration fallback, and logs a profile view.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  .put(
    "/updateConfiguration",
    async ({ body, userId }) => {
      // No logic here — just call the service and return its response.
      return await updateConfiguration(body as UpdateConfiguration, userId);
    },
    {
      body: t.Object({}, { additionalProperties: true }),
      detail: {
        tags: ["Users"],
        summary: "Update the user's profile configuration",
        description:
          "Stores the whole request body under the user's configuration field.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  .put(
    "/updateprofile",
    async ({ body, userId }) => {
      // No logic here — just call the service and return its response.
      return await updateUserProfile(body as UpdateProfileDTO, userId);
    },
    {
      body: t.Object(
        {
          userName: t.Optional(t.String()),
          fullName: t.Optional(t.String()),
          email: t.Optional(t.String()),
          profilePicture: t.Optional(t.String()),
          coverPhoto: t.Optional(t.String()),
          phoneNumber: t.Optional(t.String()),
        },
        { additionalProperties: true }
      ),
      detail: {
        tags: ["Users"],
        summary: "Update the current user's profile (name/photo/email/phone)",
        description:
          "Updates profile fields and syncs userName/email to Keycloak when changed.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  .post(
    "/recreateAccount",
    async ({ userId }) => {
      // No logic here — just call the service and return its response.
      return await recreateAccount(userId);
    },
    {
      detail: {
        tags: ["Users"],
        summary: "Re-create the current user's local account from Keycloak",
        description:
          "Provisions a fresh user doc from the Keycloak profile and runs post-signup setup.",
        security: [{ bearerAuth: [] }],
      },
    }
  )
  .patch(
    "/delete",
    async ({ body, userId }) => {
      const currentPassword = (body as any)?.currentPassword;
      // No logic here — just call the service and return its response.
      return await deleteAccount(userId, { currentPassword });
    },
    {
      body: t.Object(
        { currentPassword: t.Optional(t.String()) },
        { additionalProperties: true }
      ),
      detail: {
        tags: ["Users"],
        summary: "Delete the current user's account",
        description:
          "Verifies the current password, then deletes the account and its connections.",
        security: [{ bearerAuth: [] }],
      },
    }
  );
