/**
 * All environment variables / constants used by the Keycloak webhook flow.
 * Copy names and defaults EXACTLY from the source projects (§7 of the spec).
 */
export const constants = {
  // --- Mongo (single DB per service convention) ---
  DATABASE_URL: process.env.DATABASE_URL ?? "mongodb://localhost:27017",
  DATABASE_NAME: process.env.DATABASE_NAME ?? "Traderverse-Authentication",

  // --- Keycloak (issuer/admin) ---
  KEYCLOAK_BASE_URL: process.env.KEYCLOAK_BASE_URL ?? "http://localhost:8080",
  KEYCLOAK_REALM_NAME: process.env.KEYCLOAK_REALM_NAME ?? "traderverse",
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID ?? "",
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET ?? "",
  // Public client used to verify a user's current password (direct access grants).
  KEYCLOAK_PUBLIC_CLIENT_ID: process.env.KEYCLOAK_PUBLIC_CLIENT_ID ?? "user-identity-api",
  // Must match between Keycloak, the webhook sender and this service.
  KEYCLOAK_WEBHOOK_SECRET: process.env.KEYCLOAK_WEBHOOK_SECRET ?? "test",

  // --- Signup / security ---
  APIURL: process.env.APIURL ?? "https://profiles.traderverse.io",
  JWT_SECRET: process.env.JWT_SECRET ?? "traderverse-jwt-secret",
  BCRYPT_HASH_ROUNDS: Number(process.env.BCRYPT_HASH_ROUNDS ?? 10),
  WEBSITE_COLOR: "#191527",
  // Hard-coded cutoff from source: first-login flag only applies to newer users.
  FIRST_LOGIN_CUTOFF: 1778586336966,

  // --- Referral (Viral Loops) ---
  REFERRAL_API_TOKEN: process.env.REFERRAL_API_TOKEN ?? "",

  // --- User service sync ---
  USER_SERVICE_HOST: process.env.USER_SERVICE_HOST ?? "",
  USER_SERVICE_PORT: process.env.USER_SERVICE_PORT ?? "",

  // --- Analytics: AppsFlyer ---
  APP_FLYER_DEV_KEY: process.env.APP_FLYER_DEV_KEY ?? "",
  ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME ?? "",
  IOS_APP_ID: process.env.IOS_APP_ID ?? "",

  // --- Analytics: GA4 ---
  ANDROID_APP_FIREBASE_ID: process.env.ANDROID_APP_FIREBASE_ID ?? "",
  IOS_APP_FIREBASE_ID: process.env.IOS_APP_FIREBASE_ID ?? "",
  GOOGLE_ANALYTICS_ANDROID_API_SECRET: process.env.GOOGLE_ANALYTICS_ANDROID_API_SECRET ?? "",
  GOOGLE_ANALYTICS_IOS_API_SECRET: process.env.GOOGLE_ANALYTICS_IOS_API_SECRET ?? "",
  GOOGLE_ANALYTICS_DEBUG_MODE: process.env.GOOGLE_ANALYTICS_DEBUG_MODE ?? "1",

  // --- Analytics: Meta CAPI ---
  META_CAPI_DATASET_ID: process.env.META_CAPI_DATASET_ID ?? "",
  META_CAPI_ACCESS_TOKEN: process.env.META_CAPI_ACCESS_TOKEN ?? "",
  META_CAPI_TEST_EVENT_CODE: process.env.META_CAPI_TEST_EVENT_CODE ?? "",
  IOS_BUNDLE_ID: process.env.IOS_BUNDLE_ID ?? "",
  ANDROID_PACKAGE_NAME_META: process.env.ANDROID_PACKAGE_NAME_META ?? "",

  // --- NATS: Users-Engine index events (per NATS → Users-Engine contract) ---
  // NOTE (verified 2026-09-02): the local cluster (traderguild-nats) uses an
  // auth callout — an ANONYMOUS connect times out. The static dev user
  // auth/auth (AUTH account, JetStream enabled) is what works locally.
  NATS_URL: process.env.NATS_URL ?? "nats://localhost:4222",
  // Credentials are sent ONLY if BOTH user and password are non-blank.
  NATS_USER: process.env.NATS_USER ?? "auth",
  NATS_PASSWORD: process.env.NATS_PASSWORD ?? "auth",
  USER_INDEX_UPSERT_SUBJECT: process.env.USER_INDEX_UPSERT_SUBJECT ?? "users.index.upsert",
  USER_INDEX_DELETE_SUBJECT: process.env.USER_INDEX_DELETE_SUBJECT ?? "users.index.delete",
} as const;
