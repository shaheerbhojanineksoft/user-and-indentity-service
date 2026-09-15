import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";

import { constants } from "../config/constants";
import { LOG_TYPES } from "../dto/keycloak-webhook.dto";
import type { KeycloakWebhookDTO } from "../dto/keycloak-webhook.dto";
import type { MultiRegisterDTO } from "../dto/multi-register.dto";
import type { RegisterUserFromKeycloakDTO } from "../dto/register-user-from-keycloak.dto";
import { failure, success } from "../dto/response.model";
import {
  findUser,
  insertUser,
  updateUser,
} from "../repositories/users.repo";
import { upsertAffiliateReferral } from "../repositories/affiliate.repo";
import { insertProfileLog } from "../repositories/profileLogs.repo";
import { sendAnalyticsEvents } from "./analytics.service";
import { getUserDetails } from "./keycloak.service";
import { publishUserUpsert } from "./nats.publisher";
import { addInitialSections } from "./widget.service";
import { generateUniqueReferralCode } from "../utils/referral";
import { createToken } from "../utils/token";

/* ------------------------------------------------------------------ */
/* 4.1 Seed default initial configuration (EXACT values)              */
/* ------------------------------------------------------------------ */

function defaultUserProfileConfiguration() {
  return {
    tabs: [],
    rightSideMenu: [],
  };
}

export function initialConfigurationBeforeSignUp(obj: Record<string, any>): void {
  obj["profilePicture"] = 0;
  obj["coverPhoto"] = 0;
  obj["isProfileCompleted"] = false;
  obj["isAuthenticatedWithTwitter"] = false;
  obj["friendCount"] = 0;
  obj["followingCount"] = 0;
  obj["followersCount"] = 0;
  obj["profileConfiguration"] = defaultUserProfileConfiguration();
  obj["websiteColor"] = constants.WEBSITE_COLOR;
  obj["isAuthenticatedWithReddit"] = false;
  obj["signInType"] = "normal";
  obj["isAuthenticatedWithLinkedin"] = false;
}

/* ------------------------------------------------------------------ */
/* 5.3 Multi register — THE user creation routine                     */
/* ------------------------------------------------------------------ */

function checkMultiLoginField(value: string): { isEmail: boolean; isPhone: boolean } {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const phone = !email && /^[0-9+\-()\s]{7,15}$/.test(value);
  return { isEmail: email, isPhone: phone };
}

export async function multiRegister(
  data: MultiRegisterDTO,
  userId = ""
) {
  // 1) Validate + normalize
  const emailOrPhone = data.email ?? "";
  const { isEmail, isPhone } = checkMultiLoginField(emailOrPhone);
  if (!isEmail && !isPhone) {
    return failure("Invalid Email or Phone Number");
  }
  data.email = (data.email ?? "").toLowerCase();
  data.userName = (data.userName ?? "").toLowerCase();

  // 2) Existence check
  const existing = await findUser({
    $or: [{ email: data.email }, { userName: data.userName }, { phone: data.email }],
  });
  if (existing) {
    if (existing.email === data.email) return failure("Email Already Exist");
    if (existing.userName === data.userName) return failure("Username Already Exist");
    if (existing.phone === data.email) return failure("Phone Number Already Exist");
    return failure("User Already Exist");
  }

  // 3) Build user object (deep copy of DTO)
  const userObj: Record<string, any> = { ...data };
  let emailVerificationToken: string | undefined;

  if (!userId) {
    // Normal register — hash the password.
    userObj.password = await bcrypt.hash(data.password ?? "", constants.BCRYPT_HASH_ROUNDS);
  }

  if (isEmail) {
    userObj.isEmailVerified = false;
    emailVerificationToken = randomUUID();
    userObj.emailVerificationToken = emailVerificationToken;
  } else {
    userObj.phone = data.email;
    delete userObj.email;
    userObj.isPhoneVerified = false;
  }

  // 4) Defaults
  userObj.createdOn = Date.now();
  userObj.referralCode = generateUniqueReferralCode();
  userObj.createdBy = "System";
  // NOTE: NO password for Keycloak users (Keycloak owns auth) and NO uid / Firebase /
  // Cognito user creation — intentionally removed (spec §12 / user decision): for
  // Keycloak signups they were flag-gated off or futile (Firebase always rejected
  // the empty password), so removing them changes no observable behavior.

  // 5) _id — Keycloak UUID becomes the Mongo _id
  const id = userId || randomUUID();

  // 6) Avatar job (background — best-effort)
  try {
    console.log(`[avatar] startAvatarJob(fullName=${data.fullName}, id=${id}, 0)`);
  } catch {}

  // 7) Insert user
  const saved = await insertUser({ _id: id, ...userObj });

  // 7b) Keep the Users-Engine search index fresh. Publish AFTER the Mongo write
  // commits (best-effort — never throws, never blocks signup/recreate).
  void publishUserUpsert(String(id));

  // 8) Never expose the password
  delete saved.password;

  // 9) Token
  const token = await createToken({ _id: id });

  // 10) Return
  return success({
    user: { ...saved, _id: id, signUpRef: data.signUpRef ?? "" },
    token,
    emailVerificationLink: emailVerificationToken
      ? `${constants.APIURL}/api/verification/email/${emailVerificationToken}`
      : "",
  });
}

/* ------------------------------------------------------------------ */
/* 5.2 registerUserFromKeycloak — dedup + create                      */
/* ------------------------------------------------------------------ */

export async function registerUserFromKeycloak(data: RegisterUserFromKeycloakDTO) {
  const multiRegisterData: MultiRegisterDTO = {
    fullName: data.firstName || data.userName || "",
    userName: data.userName || data.email || "",
    signUpRef: data.signUpRef || "",
    email: data.email || "",
    password: "", // EMPTY for Keycloak users
    registeredFrom: data.registeredFrom || "",
    country: data.country || "",
    ...(data.initialConfiguration ?? {}), // spreads all seeded defaults
  };

  // Dedup check on Mongo Users
  const existing = await findUser({
    $or: [{ _id: data.userId }, { email: data.email }, { userName: data.userName }],
  });
  if (existing) {
    return failure("User with this email or username already exists");
  }

  return multiRegister(multiRegisterData, data.userId);
}

/* ------------------------------------------------------------------ */
/* 5.1 keyCloakWebhook (microservice side) — REGISTER path            */
/* ------------------------------------------------------------------ */

export async function keyCloakWebhookMicroservice(data: KeycloakWebhookDTO) {
  if (data.type !== LOG_TYPES.REGISTER) return;

  const userDetails = await getUserDetails(data.authDetails?.userId ?? "");
  const signUpRef = userDetails?.attributes?.signUpRef?.[0] ?? "";
  const country = userDetails?.attributes?.country?.[0] ?? "";

  const result = await registerUserFromKeycloak({
    userId: data.authDetails?.userId ?? "",
    email: data.details?.email,
    firstName: data.details?.first_name,
    userName: data.details?.username,
    lastName: data.details?.last_name,
    signUpRef,
    registeredFrom: data.authDetails?.clientId,
    initialConfiguration: data.initialConfiguration,
    country,
  });

  if (result.isSuccess) {
    // Fire analytics for the same event.
    await keyCloakWebhookOtherEvents(data);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* 5.4 keyCloakWebhookOtherEvents — LOGIN/EMAIL events + analytics    */
/* ------------------------------------------------------------------ */

export async function keyCloakWebhookOtherEvents(data: KeycloakWebhookDTO): Promise<void> {
  const userId = data.authDetails?.userId ?? "";

  // 1) First-login flag (LOGIN only)
  if (data.type === LOG_TYPES.LOGIN && userId) {
    const user = await findUser({ _id: userId });
    if (user && (user.createdOn ?? 0) >= constants.FIRST_LOGIN_CUTOFF && !user.isFirstLogin) {
      await updateUser({ _id: userId }, { $set: { isFirstLogin: true } });
    }
  }

  // 2) Fetch Keycloak user attributes
  const userDetails = await getUserDetails(userId);
  const attributes = userDetails?.attributes ?? {};
  const afId = attributes.afId?.[0];
  const fbId = attributes.fbId?.[0];
  const madId = attributes.madId?.[0];
  const platform = attributes.platform?.[0];

  // 3-5) Analytics (Promise.allSettled — never throws)
  await sendAnalyticsEvents({
    type: data.type,
    userId,
    time: data.time ?? Date.now(),
    platform,
    fbId,
    afId,
    madId,
    clientId: data.authDetails?.clientId,
  });
}

/* ------------------------------------------------------------------ */
/* 4 + 5.1 Orchestrator — entry point from the controller             */
/* ------------------------------------------------------------------ */

export async function keyCloakWebhook(data: KeycloakWebhookDTO) {
  if (data.type === LOG_TYPES.REGISTER) {
    // Gateway-side: seed initialConfiguration + register via microservice routine.
    const initialConfiguration: Record<string, any> = {};
    initialConfigurationBeforeSignUp(initialConfiguration);

    const result = await keyCloakWebhookMicroservice({
      ...data,
      initialConfiguration,
    });

    if (result?.isSuccess && result.data?.user) {
      const user = result.data.user as Record<string, any>;
      await actionsAfterSignUp(user, "", "", user.signUpRef ?? "", user.userName ?? "");
    }
    return result;
  }

  if (
    data.type === LOG_TYPES.LOGIN ||
    data.type === LOG_TYPES.SEND_VERIFY_EMAIL ||
    data.type === LOG_TYPES.VERIFY_EMAIL
  ) {
    await keyCloakWebhookOtherEvents(data); // fire-and-forget style
  }
}

/* ------------------------------------------------------------------ */
/* 4.2 actionsAfterSignUp — post-signup side effects (gateway side)   */
/* ------------------------------------------------------------------ */

async function affiliateReferral(userId: string, signUpRef: string): Promise<void> {
  if (!signUpRef || !constants.REFERRAL_API_TOKEN) return;
  try {
    const res = await fetch(
      `https://app.viral-loops.com/api/v3/campaign/participant/data?referralCode=${encodeURIComponent(signUpRef)}`,
      { headers: { apiToken: constants.REFERRAL_API_TOKEN } }
    );
    if (!res.ok) {
      console.error("[referral] viral-loops request failed:", res.status);
      return;
    }
    const data = (await res.json()) as {
      email?: string;
      firstname?: string;
      lastname?: string;
      referralCode?: string;
    };
    await upsertAffiliateReferral({
      userId,
      email: data.email,
      firstname: data.firstname,
      lastname: data.lastname,
      referralCode: data.referralCode ?? signUpRef,
    });
  } catch (err) {
    console.error("[referral] affiliateReferral error:", err);
  }
}

export async function actionsAfterSignUp(
  user: Record<string, any>,
  _userAgentString: string,
  _ip: string,
  signUpRef: string,
  _userName: string
): Promise<void> {
  const userId = String(user._id);

  // 1) Affiliate referral
  await affiliateReferral(userId, signUpRef);

  // 2) Badges job (background — best-effort)
  try {
    console.log(`[badges] enqueue badges-scapper for userId=${userId}`);
  } catch {}

  // 3) Signup logs
  try {
    await insertProfileLog({
      uniqueId: randomUUID(),
      action: "signup",
      currentDate: Date.now(),
      sectionName: null,
      site: user,
      profileId: null,
      userAgentString: "",
      ip: "",
      userId,
    });
  } catch (err) {
    console.error("[signup] insertProfileLog error:", err);
  }

  // 4) Initial sections — create the 16 default widget sections (spec §5.5.5)
  try {
    await addInitialSections(userId);
  } catch (err) {
    console.error("[sections] addInitialSections error:", err);
  }
}

