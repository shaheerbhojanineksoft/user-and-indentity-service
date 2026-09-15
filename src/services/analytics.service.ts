import { randomUUID } from "node:crypto";

import { constants } from "../config/constants";
import type { AnalyticsIdentity } from "../dto/analytics.dto";
import { LOG_TYPES } from "../dto/keycloak-webhook.dto";
import { toSha256 } from "../utils/crypto";

const EVENT_NAMES: Record<string, { ga: string; af: string; meta: string }> = {
  [LOG_TYPES.REGISTER]: {
    ga: "signup_completed",
    af: "af_complete_registration",
    meta: "CompleteRegistration",
  },
  [LOG_TYPES.SEND_VERIFY_EMAIL]: {
    ga: "email_verification_sent",
    af: "af_email_verification_sent",
    meta: "email_verification_sent",
  },
  [LOG_TYPES.VERIFY_EMAIL]: {
    ga: "email_verification_completed",
    af: "af_email_verification_completed",
    meta: "email_verification_completed",
  },
  [LOG_TYPES.LOGIN]: { ga: "first_sign_in", af: "af_first_sign_in", meta: "Lead" },
};

function isAndroid(platform?: string): boolean {
  return platform === "android";
}

async function sendGa4Event(id: AnalyticsIdentity, event: string): Promise<void> {
  if (!id.fbId) return;
  const firebaseAppId = isAndroid(id.platform)
    ? constants.ANDROID_APP_FIREBASE_ID
    : constants.IOS_APP_FIREBASE_ID;
  const apiSecret = isAndroid(id.platform)
    ? constants.GOOGLE_ANALYTICS_ANDROID_API_SECRET
    : constants.GOOGLE_ANALYTICS_IOS_API_SECRET;
  if (!firebaseAppId || !apiSecret) return;

  const url = `https://www.google-analytics.com/mp/collect?firebase_app_id=${encodeURIComponent(firebaseAppId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_instance_id: id.fbId,
      user_id: id.userId,
      events: [
        {
          name: event,
          params: {
            engagement_time_msec: "1",
            debug_mode: constants.GOOGLE_ANALYTICS_DEBUG_MODE,
          },
        },
      ],
    }),
  });
}

async function sendAppsFlyerS2SEvent(id: AnalyticsIdentity, event: string): Promise<void> {
  if (!id.afId) return;
  const appId = isAndroid(id.platform)
    ? constants.ANDROID_PACKAGE_NAME
    : constants.IOS_APP_ID;
  if (!appId || !constants.APP_FLYER_DEV_KEY) return;

  const url = `https://api2.appsflyer.com/inappevent/${encodeURIComponent(appId)}`;
  await fetch(url, {
    method: "POST",
    headers: {
      authentication: constants.APP_FLYER_DEV_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      appsflyer_id: id.afId,
      eventName: event,
      customer_user_id: id.userId,
    }),
  });
}

async function sendMetaCapiEvent(id: AnalyticsIdentity, event: string): Promise<void> {
  const datasetId = constants.META_CAPI_DATASET_ID;
  const accessToken = constants.META_CAPI_ACCESS_TOKEN;
  if (!datasetId || !accessToken) return;

  const madid =
    id.madId && id.madId !== "00000000-0000-0000-0000-000000000000"
      ? id.madId
      : "00000000-0000-0000-0000-000000000000";

  const url = `https://graph.facebook.com/v21.0/${datasetId}/events`;
  const testEventCode = constants.META_CAPI_TEST_EVENT_CODE
    ? { test_event_code: constants.META_CAPI_TEST_EVENT_CODE }
    : {};

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: [
        {
          event_name: event,
          event_time: Math.floor(id.time / 1000),
          action_source: "app",
          event_id: randomUUID().toLowerCase(),
          user_data: {
            madid: toSha256(madid),
            external_id: [toSha256(id.userId)],
          },
          custom_data: {
            platform: id.platform,
            utm_source: id.clientId,
          },
          app_data: {
            advertiser_tracking_enabled: true,
            application_tracking_enabled: true,
            extinfo: [
              "a2",
              isAndroid(id.platform)
                ? constants.ANDROID_PACKAGE_NAME_META
                : constants.IOS_BUNDLE_ID,
              "",
              "",
              "",
              "",
              "",
            ],
          },
          ...testEventCode,
        },
      ],
    }),
  });
}

/**
 * Fire all analytics events for an event type. Uses Promise.allSettled and
 * NEVER throws — analytics must not break the webhook flow.
 */
export async function sendAnalyticsEvents(id: AnalyticsIdentity): Promise<void> {
  const names = EVENT_NAMES[id.type];
  if (!names) return; // no mapping → no-op

  const jobs: Promise<unknown>[] = [];
  if (id.fbId) jobs.push(sendGa4Event(id, names.ga));
  if (id.afId) jobs.push(sendAppsFlyerS2SEvent(id, names.af));
  jobs.push(sendMetaCapiEvent(id, names.meta));

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error("[analytics] event failed:", r.reason);
    }
  }
}
