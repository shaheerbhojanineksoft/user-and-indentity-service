import type { UpdateConfiguration } from "../dto/update-configuration.dto";
import type { UpdateProfileDTO } from "../dto/update-profile.dto";
import {
  deleteOneUser,
  existsUserName,
  findManyUsers,
  findOneUser,
  findUserByUsername,
  isUserNameTaken,
  updateUser,
} from "../repositories/users.repo";
import {
  deleteOneConnection,
  existsInConnections,
  findManyConnections,
} from "../repositories/connections.repo";
import { existsInBlocked } from "../repositories/blocked.repo";
import { findSocialConnection } from "../repositories/socialConnections.repo";
import { findOrIncrementViewLog } from "../repositories/profileViewLogs.repo";
import {
  changeEmail,
  changeUserName,
  getUserDetails,
  verifyCurrentPassword,
} from "./keycloak.service";
import {
  actionsAfterSignUp,
  initialConfigurationBeforeSignUp,
  registerUserFromKeycloak,
} from "./keycloak-webhook.service";
import { publishUserDelete, publishUserUpsert } from "./nats.publisher";
import { followFoundersForUser } from "./follow-founders.service";

// Default profile configuration — copied EXACTLY from source
// src/auth/dto/initial-setting.ts → UserProfileConfiguration
const DEFAULT_PROFILE_CONFIG = {
  // 11 widgets
  widgets: [
    { name: "Show Profile", type: "showProfile", status: "public" },
    { name: "Top Statistics", type: "topStats", status: "public" },
    { name: "Attributes", type: "traderType", status: "public" },
    { name: "Social Profiles", type: "socialLinks", status: "public" },
    { name: "Badges", type: "badges", status: "public" },
    { name: "About", type: "about", status: "public" },
    { name: "Investments", type: "favouriteInvestment", status: "public" },
    { name: "Winning Trades", type: "winningTrades", status: "public" },
    { name: "Portfolio", type: "portfolio", status: "public" },
    { name: "Trades", type: "trades", status: "public" },
    { name: "Recommendations", type: "recommendation", status: "public" },
  ],
  // 4 tabs
  tabs: [
    { name: "Timeline", type: "timeline", status: "public" },
    { name: "Network", type: "network", status: "public" },
    { name: "Performance", type: "performance", status: "public" },
    { name: "Signals", type: "signals", status: "public" },
  ],
  // 4 right-side menu items
  rightSideMenu: [
    { name: "Prediction Card", type: "predictionCard", status: "public" },
    { name: "Portfolio Card", type: "portfolioCard", status: "public" },
    { name: "Top Friends", type: "topFriends", status: "public" },
    { name: "Photos", type: "photos", status: "public" },
  ],
};

function fillProfileConfiguration(user: Record<string, any>): void {
  if (!user.profileConfiguration) user.profileConfiguration = {};
  if (!user.profileConfiguration.widgets?.length)
    user.profileConfiguration.widgets = DEFAULT_PROFILE_CONFIG.widgets;
  if (!user.profileConfiguration.tabs?.length)
    user.profileConfiguration.tabs = DEFAULT_PROFILE_CONFIG.tabs;
  if (!user.profileConfiguration.rightSideMenu?.length)
    user.profileConfiguration.rightSideMenu = DEFAULT_PROFILE_CONFIG.rightSideMenu;
}

/**
 * Business logic for GET /users/me (per source spec).
 * Loads the FULL user document from the Users collection (not token claims)
 * and returns it as { isSuccess, data: { user } }.
 */
export async function me(userId: string) {
  const user = await findOneUser({ _id: userId });
  if (!user) {
    return { isSuccess: false, message: "something went wrong", data: {} };
  }
  fillProfileConfiguration(user);
  return { isSuccess: true, message: "success", data: { user } };
}

/**
 * Business logic for GET /users/byId/:id (per source spec — exact, no improvisation).
 *
 * - targetUserId  = path param `:id` (whose profile is being viewed)
 * - currentUserId = logged-in user (from X-Userinfo sub)
 *
 * Relationship flags are computed DIRECTLY from the `Connections` + `Blocked`
 * collections (no social service). `socialConnections` comes from the
 * `social_connections` collection (or null). Password is never exposed.
 */
export async function getUserById(targetUserId: string, currentUserId: string) {
  try {
    // 1. Fetch the viewed user
    const user = await findOneUser({ _id: targetUserId });
    if (!user) {
      return { isSuccess: true, message: "User not found." }; // NOTE: isSuccess TRUE
    }

    // 3. Relationship flags (only when viewing SOMEONE ELSE's profile)
    if (targetUserId !== currentUserId) {
      user.isFollowing = await existsInConnections(currentUserId, targetUserId, "following");
      user.isFriend = await existsInConnections(currentUserId, targetUserId, "friends");
      user.isRequestSent = await existsInConnections(
        currentUserId,
        targetUserId,
        "friendrequest",
        "pending"
      );
      user.isBlocked = await existsInBlocked(currentUserId, targetUserId);
    } else {
      user.isFollowing = false;
      user.isFriend = false;
      user.isRequestSent = false;
      user.isBlocked = false;
    }

    // 4. Never expose the password
    delete user.password;

    // 5. Social connections
    const socialConn = await findSocialConnection(targetUserId);
    user.socialConnections = socialConn?.socialConnections ?? null;

    // 6. Response
    return { isSuccess: true, message: "", data: user };
  } catch {
    return { isSuccess: false, message: "Somethig Went Wrong." }; // exact source string (typo kept)
  }
}

/** Fields that must NOT be updated via PUT /users (per source spec). */
const IGNORED_FIELDS = [
  "email",
  "emailVerificationToken",
  "is2faAuthenticated",
  "isAuthenticatedWithLinkedin",
  "isEmailVerified",
  "sections",
  "stats",
];

/* ------------------------------------------------------------------ */
/* PUT /users — new profile fields (added 2026-09-16)                  */
/* ------------------------------------------------------------------ */

/** Always required on PUT /users (trimmed, non-empty). */
const REQUIRED_STRING_FIELDS = ["country", "theme", "experience"] as const;

/**
 * Age at/above which the user counts as an adult: `parentalEmail` is only
 * MANDATORY while `age < 18`. At 18 or above it is optional (still stored when
 * sent). Flip this single comparison if the rule must be "18 and below".
 */
const ADULT_AGE = 18;

/** Trimmed string, or "" when the value is missing/not a string. */
function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Accepts a number or a numeric string (frontends send both) → number | null. */
function asAge(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Validate + normalise the new profile fields IN PLACE (trimmed strings +
 * numeric age). Returns an error message, or "" when the payload is valid.
 *
 * Rules: country / age / theme / experience are REQUIRED; `parentalEmail` is
 * required only when the user is under `ADULT_AGE` (minors need a guardian
 * email). Validation lives here (not in the Elysia schema) so the request is
 * rejected with the standard `{ isSuccess: false, message, data: {} }` body
 * instead of Elysia's 422 validation envelope.
 */
function validateProfileFields(payload: Record<string, any>): string {
  // 1) Required non-empty strings
  for (const field of REQUIRED_STRING_FIELDS) {
    const value = asTrimmedString(payload[field]);
    if (!value) return `${field} is required`;
    payload[field] = value;
  }

  // 2) Required age (stored as a number)
  const age = asAge(payload.age);
  if (age === null || age <= 0) return "age is required";
  payload.age = age;

  // 3) parentalEmail — mandatory for minors, optional for adults
  const parentalEmail = asTrimmedString(payload.parentalEmail);
  if (age < ADULT_AGE) {
    if (!parentalEmail) return "parentalEmail is required for users under 18";
    payload.parentalEmail = parentalEmail;
  } else if (parentalEmail) {
    payload.parentalEmail = parentalEmail;
  } else {
    // Adult without a guardian email — never overwrite an existing value with "".
    delete payload.parentalEmail;
  }

  return "";
}

/**
 * Business logic for PUT /users (per source spec — exact, no improvisation).
 * Updates the logged-in user's profile, then (if the userName changed) also
 * updates the username in Keycloak via Admin REST.
 */
export async function updateProfile(payload: Record<string, any>, currentUserId: string) {
  // 1. Drop ignored fields
  IGNORED_FIELDS.forEach((f) => delete payload[f]);

  // 1b. New profile fields: country / age / theme / experience required,
  //     parentalEmail required only under 18 (see validateProfileFields).
  const profileError = validateProfileFields(payload);
  if (profileError) return { isSuccess: false, message: profileError, data: {} };

  // 2. Fetch existing user
  const fetchUser = await findOneUser({ _id: currentUserId });
  if (!fetchUser) return { isSuccess: false, message: "No user found", data: {} };

  // 3. Username uniqueness (trim + lowercase, exclude self)
  if (payload.userName) {
    payload.userName = payload.userName.trim().toLowerCase();
    const exists = await existsUserName(payload.userName, currentUserId);
    if (exists) return { isSuccess: false, message: "userName already exists", data: {} };
  }

  // 4. Founder auto-follow — FIRST-TIME favourite-investment completion ONLY:
  //    the value already stored on the user doc must be false in Mongo AND the
  //    payload must send it as true. Runs BEFORE the $set so the returned
  //    document already carries the fresh followingCount. Best-effort — a
  //    failure here is logged and never breaks the profile update.
  const wantsFavouriteInvestmentCompleted =
    payload.isFavouriteInvestmentCompleted === true ||
    payload.isFavouriteInvestmentCompleted === "true";
  if (wantsFavouriteInvestmentCompleted && !fetchUser.isFavouriteInvestmentCompleted) {
    await followFoundersForUser(fetchUser);
  }

  // 4+5. Update Mongo user, never expose password
  const user = await updateUser({ _id: currentUserId }, { $set: payload });
  if (user) delete user.password;

  // 5b. Keep the Users-Engine search index fresh (per NATS contract). Publish
  // AFTER the Mongo update commits (best-effort — never throws, never blocks).
  if (user) void publishUserUpsert(currentUserId);

  // 7. Change username in Keycloak (only if actually changed)
  if (payload.userName && payload.userName !== fetchUser.userName) {
    try {
      await changeUserName(currentUserId, payload.userName); // Keycloak Admin REST
    } catch (err) {
      // Keycloak failure must NOT fail the main response (matches source).
      console.error("[update] changeUserName failed:", err);
    }
  }

  // 6+8. Response
  return { isSuccess: true, message: "User updated successfully.", data: user };
}

/** Slugify a full name into a username base (exact source rules — §4). */
function slugifyFullNameToUsernameBase(fullname: string): string {
  if (!fullname || !fullname.trim()) return "";
  return fullname
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents/diacritics
    .replace(/\s+/g, "-") // spaces → hyphen
    .replace(/[^a-z0-9-]+/g, "") // strip anything not a-z0-9-
    .replace(/-+/g, "-") // collapse hyphens
    .replace(/^-|-$/g, ""); // trim leading/trailing hyphens
}

/**
 * Business logic for GET /users/username/generate/:fullName (per source spec).
 * Only the Mongo layer is used — no other service call.
 */
export async function generateUsername(fullName: string) {
  try {
    let decoded = (fullName ?? "").trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      // keep raw if decode fails
    }

    const base = slugifyFullNameToUsernameBase(decoded);
    if (!base) {
      return {
        isSuccess: false,
        message: "Full name is required to generate a username.",
        data: {},
      };
    }

    // base, base-1, base-2 (max 3 checks)
    for (let n = 0; n < 3; n++) {
      const candidate = n === 0 ? base : `${base}-${n}`;
      if (!(await isUserNameTaken(candidate))) {
        return { isSuccess: true, message: "", data: { userName: candidate } };
      }
    }

    const random = `${base}-${Date.now()}`;
    if (!(await isUserNameTaken(random))) {
      return { isSuccess: true, message: "", data: { userName: random } };
    }

    // fallback — NO uniqueness check
    const fallback = `${base}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    return { isSuccess: true, message: "", data: { userName: fallback } };
  } catch {
    return { isSuccess: false, message: "Somethig Went Wrong." }; // exact source typo kept
  }
}

/**
 * Business logic for PUT /users/updateConfiguration (per source spec).
 * The whole request body is stored under the user's `configuration` field.
 * No password handling, no extra fields — only Mongo is used.
 */
export async function updateConfiguration(
  data: UpdateConfiguration,
  currentUserId: string
) {
  const getUser = await findOneUser({ _id: currentUserId });
  if (!getUser) {
    return { isSuccess: false, message: "something went wrong" };
  }

  const user = await updateUser(
    { _id: currentUserId },
    { $set: { configuration: data } } // whole body stored under "configuration"
  );

  return { isSuccess: true, message: "Configuration updated successFully", data: user };
}

/** 10 default widgets — exact profileConfiguration fallback for getUsername (§6). */
const DEFAULT_WIDGETS = [
  { name: "Show Profile", type: "showProfile", status: "public" },
  { name: "Top Statistics", type: "topStats", status: "public" },
  { name: "Attributes", type: "traderType", status: "public" },
  { name: "Social Profiles", type: "socialLinks", status: "public" },
  { name: "Badges", type: "badges", status: "public" },
  { name: "About", type: "about", status: "public" },
  { name: "Investments", type: "favouriteInvestment", status: "public" },
  { name: "Winning Trades", type: "winningTrades", status: "public" },
  { name: "Portfolio", type: "portfolio", status: "public" },
  { name: "Recommendations", type: "recommendation", status: "public" },
];

/** Write a profile view log (create with viewCount 1 / increment on repeat). */
async function addViewLogs(userId: string, connectionId: string) {
  const user = await getUserById(userId, userId);
  const connection = await getUserById(connectionId, userId);
  if (!user.data || !connection.data) return; // both users exist in this flow
  const obj = {
    connectionCountry: connection.data.country,
    connectionCoverPhoto: connection.data.coverPhoto,
    connectionGender: connection.data.gender,
    connectionId,
    connectionName: connection.data.fullName,
    connectionProfilePicture: connection.data.profilePicture,
    connectionUsername: connection.data.userName,
    createdOn: Date.now(),
    modifiedBy: "",
    modifiedOn: Date.now(),
    userCountry: user.data.country,
    userCoverPhoto: user.data.coverPhoto,
    userFullName: user.data.fullName,
    userGender: user.data.gender,
    userId,
    userName: user.data.userName,
    userProfilePicture: user.data.profilePicture,
  };
  await findOrIncrementViewLog(userId, connectionId, obj);
}

/**
 * Business logic for GET /users/:username/username (per source spec).
 * Only Mongo is used — flags, view log, and profile-config fallback are all
 * direct DB operations.
 */
export async function getUsername(username: string, currentUserId: string) {
  try {
    const viewed = await findUserByUsername(username);
    if (!viewed) return { isSuccess: true, message: "User not found." };

    if (String(viewed._id) !== currentUserId) {
      viewed.isFollowing = await existsInConnections(currentUserId, viewed._id, "following");
      viewed.isFriend = await existsInConnections(currentUserId, viewed._id, "friends");
      viewed.isRequestSent = await existsInConnections(
        currentUserId,
        viewed._id,
        "friendrequest",
        "pending"
      );
      viewed.isBlocked = await existsInBlocked(currentUserId, viewed._id);
      await addViewLogs(currentUserId, viewed._id);
    } else {
      viewed.isFollowing = false;
      viewed.isFriend = false;
      viewed.isRequestSent = false;
      viewed.isBlocked = false;
    }

    if (!viewed.profileConfiguration) {
      viewed.profileConfiguration = { widgets: DEFAULT_WIDGETS };
    }
    delete viewed.password;

    return { isSuccess: true, message: "", data: viewed };
  } catch {
    return { isSuccess: false, message: "Somethig Went Wrong." }; // exact source typo kept
  }
}

/**
 * Business logic for PUT /users/updateprofile (per source spec).
 * Updates the profile; also syncs userName/email to Keycloak when changed.
 */
export async function updateUserProfile(data: UpdateProfileDTO, currentUserId: string) {
  try {
    const user = await findOneUser({ _id: currentUserId });
    if (!user) return { isSuccess: false, message: "No user found", data: {} };

    // Username
    const userNameTaken = await isUserNameTaken(data.userName);
    if (data.userName !== user.userName) {
      data.userName = data.userName.trim().toLowerCase();
      if (userNameTaken) {
        return { isSuccess: false, message: "User name already exist try with other names" };
      }
      user.userName = data.userName.trim();
      try {
        await changeUserName(currentUserId, data.userName); // Keycloak Admin REST
      } catch (err) {
        console.error("[updateprofile] changeUserName failed:", err);
      }
    }

    user.profilePicture = data.profilePicture;
    if (!user.coverPhoto) user.coverPhoto = "";
    user.coverPhoto = data.coverPhoto;
    user.fullName = data.fullName.trim();

    // Email (only if changing + temp email verified)
    if (
      data.email !== user.email &&
      user.temporaryEmail?.email === data.email &&
      user.temporaryEmail?.istemporaryEmailVerified === true
    ) {
      user.email = user.temporaryEmail.email.trim();
      delete user.temporaryEmail;
      try {
        await changeEmail(currentUserId, data.email); // Keycloak Admin REST
      } catch (err) {
        console.error("[updateprofile] changeEmail failed:", err);
      }
    }

    // Phone
    if (user.phone === undefined) user.phone = "";
    else user.phone = data.phoneNumber.trim();

    // Mongo update — replace the whole modified user doc (minus _id)
    const { _id, ...updateBody } = user;
    const updatedEntity = await updateUser({ _id: user._id }, updateBody);
    if (updatedEntity) delete updatedEntity.password;

    // Keep the Users-Engine search index fresh (per NATS contract). Publish
    // AFTER the Mongo update commits (best-effort — never throws, never blocks).
    if (updatedEntity) void publishUserUpsert(String(user._id));

    return { isSuccess: true, message: "User updated successfully", data: updatedEntity };
  } catch (error) {
    return { isSuccess: false, message: "something went wrong", data: error };
  }
}

/**
 * Business logic for POST /users/recreateAccount (per source spec).
 * Re-creates the local account from the Keycloak profile and runs the same
 * post-signup setup. Reuses the webhook signup routines (no rewrite).
 */
export async function recreateAccount(currentUserId: string) {
  // webapi side — seed initial configuration
  const initialConfiguration: Record<string, any> = {};
  initialConfigurationBeforeSignUp(initialConfiguration);

  try {
    // auth-microservice side
    const userDetails = await getUserDetails(currentUserId); // Keycloak Admin REST
    const signUpRef = userDetails?.attributes?.signUpRef?.[0] ?? "";

    const response = await registerUserFromKeycloak({
      userId: currentUserId,
      email: userDetails.email,
      firstName: userDetails.firstName || userDetails.username,
      userName: userDetails.username || userDetails.email,
      lastName: userDetails.lastName || "",
      signUpRef,
      registeredFrom: userDetails.registeredFrom || "",
      initialConfiguration,
      country: "",
    });

    if (!response) {
      return { isSuccess: false, message: "Something Went Wrong.", data: {} };
    }

    const user = response?.data?.user as Record<string, any> | undefined;
    if (user) {
      await actionsAfterSignUp(user, "", "", user.signUpRef ?? "", user.userName ?? "");
    }

    return response;
  } catch {
    return { isSuccess: false, message: "Failed to recreate account. " };
  }
}

/* ------------------------------------------------------------------ */
/* PATCH /users/delete — account deletion (per source spec)            */
/* ------------------------------------------------------------------ */

/**
 * Business logic for PATCH /users/delete (per source spec).
 * Verifies the current password, then deletes the user + their connections
 * from the main DB. No jobs / cross-service side-effects (per spec —
 * intentionally stops after the deletion).
 */
export async function deleteAccount(
  currentUserId: string,
  data: { currentPassword?: string }
) {
  try {
    // 1. currentPassword required
    if (!data.currentPassword) {
      return { isSuccess: false, data: {}, message: "Current Password is required" };
    }

    // 2. verify current password (against Keycloak)
    const passwordValid = await verifyCurrentPassword(currentUserId, data.currentPassword);
    if (!passwordValid) {
      return { isSuccess: false, data: {}, message: "Current Password is incorrect" };
    }

    // 3. find user in main DB
    const user = await findOneUser({ _id: currentUserId });
    if (!user) {
      return { isSuccess: false, data: {}, message: "No data found" };
    }

    const userId = String(user._id);

    // 5. delete the user's connections (both directions)
    const userConnections = await findManyConnections({
      $or: [{ userId }, { connectionId: userId }],
    });
    for (const conn of userConnections) {
      await deleteOneConnection({ _id: conn._id });
    }

    // 6. delete user from main DB
    await deleteOneUser({ _id: userId });

    // 7b. Remove user from the Users-Engine search index. Publish AFTER the
    // Mongo delete commits (best-effort — never throws, never blocks delete).
    void publishUserDelete(userId);

    // 8. success
    return { isSuccess: true, data: {}, message: "Account deleted successfully" };
  } catch (error) {
    return { isSuccess: false, data: error, message: "Something went wrong" };
  }
}
