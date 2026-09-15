import { findOneUser } from "../repositories/users.repo";
import {
  findNotificationPermission,
  upsertNotificationPermission,
} from "../repositories/notificationPermission.repo";
import type { NotificationPermissionInput } from "../dto/notification-permission.dto";

/**
 * The section-notification keys (in order) + their display labels.
 * NOTE: labels are best-effort — the spec did not enumerate every one.
 */
const SECTION_KEYS: { label: string; key: string }[] = [
  { label: "Trader Type", key: "traderType" },
  { label: "Favorite Investments", key: "favouriteInvestment" },
  { label: "Best Trades", key: "winningTrades" },
  { label: "Favorite Platforms", key: "portfolio" },
  { label: "Recommendation", key: "recommendation" },
  { label: "Prediction", key: "predictions" },
  { label: "Top Stats", key: "topStats" },
  { label: "Prediction OHLC", key: "predictionsOHLC" },
  { label: "Profit and Loss", key: "profitAndLoss" },
  { label: "Watchlist", key: "watchlists" },
  { label: "Statistics", key: "statistics" },
  { label: "Images", key: "images" },
  { label: "Lists", key: "points" },
  { label: "Text", key: "text" },
  { label: "Playbook", key: "playbook" },
  { label: "Links", key: "links" },
  { label: "Benchmarking", key: "benchmarking" },
  { label: "Favorite Influencer", key: "favouriteInfluencer" },
  { label: "Highlights Left Stats", key: "highlightStats" },
  { label: "Highlights Right Stats", key: "highlightStatsRight" },
  { label: "Middle", key: "middle" },
];

/** The default setting object (created on first access). */
function buildDefaultSetting(userId: string): Record<string, any> {
  return {
    userId,
    generalNotification: {
      pushNotification: true,
      emailNotification: true,
      smsNotification: true,
      appNotification: true,
    },
    receiveFrom: {
      friends: true,
      followers: true,
      public: false,
    },
    sectionNotifications: SECTION_KEYS.map(({ label, key }) => ({
      label,
      key,
      sendNotificationOnAddingNew: true,
      sendNotificationOnChange: true,
      pushNotification: true,
      emailNotification: true,
      smsNotification: true,
      appNotification: true,
    })),
    // Shared update-layer stamps.
    modifiedBy: userId,
    modifiedOn: Date.now(),
  };
}

/**
 * Equivalent of the webapi `@Serialize(SettingResponseModel)` step — on
 * success ONLY the whitelisted (@Expose) fields survive.
 */
function serializeSetting(doc: Record<string, any>): Record<string, any> {
  return {
    _id: doc._id,
    userId: doc.userId,
    modifiedBy: doc.modifiedBy,
    modifiedOn: doc.modifiedOn,
    generalNotification: doc.generalNotification,
    receiveFrom: doc.receiveFrom,
    sectionNotifications: doc.sectionNotifications,
  };
}

/**
 * Business logic for GET /notification-permission (per spec — exact, no
 * improvisation). Equivalent of the `{ cmd: "usernotificationsetting" }` TCP
 * handler: verify the user exists → return the notification-permission doc
 * (auto-creating the default on first access). NO notification is sent by
 * this GET.
 */
export async function getNotificationSetting(userId: string) {
  try {
    // 1. user existence check.
    const user = await findOneUser({ _id: userId });
    if (!user) {
      // No user -> data is an EMPTY OBJECT (not null).
      return { isSuccess: false, data: {}, message: "No user found" };
    }

    // 3. read the permission doc (its _id IS the userId).
    let notification = await findNotificationPermission(userId);

    // 4. first access -> create the default setting (upsert) and read back.
    if (!notification) {
      await upsertNotificationPermission(userId, buildDefaultSetting(userId));
      notification = await findNotificationPermission(userId);
    }

    // 5. success — serialize to the whitelisted setting fields.
    return {
      isSuccess: true,
      data: serializeSetting((notification ?? {}) as Record<string, any>),
      message: "successfully found",
    };
  } catch (error) {
    return { isSuccess: false, data: null, message: "something went wrong", error };
  }
}

/**
 * Business logic for PUT /notification-permission (per spec — exact, no
 * improvisation). Equivalent of the `{ cmd: "notificationPermission" }` TCP
 * handler: verify user → load permission doc → merge incoming setting fields →
 * save keyed by userId. NO FCM subscribe/unsubscribe side-effect (removed for
 * bun), no notification send.
 */
export async function updateNotificationPermission(
  input: NotificationPermissionInput,
  userId: string
) {
  try {
    // userId is server-set — never trust the client.
    const ownerId = userId;

    // 1. user existence check.
    const user = await findOneUser({ _id: ownerId });
    if (!user) {
      return { isSuccess: false, data: null, message: "No user found" };
    }

    // 3. load the permission doc (its _id IS the userId).
    let permission: Record<string, any> | null = await findNotificationPermission(ownerId);
    if (!permission) permission = { userId: ownerId };

    // 5. overwrite generalNotification when provided.
    if (input.generalNotification) {
      permission.generalNotification = input.generalNotification;
    }

    // 6. overwrite receiveFrom when provided.
    if (input.receiveFrom) {
      permission.receiveFrom = input.receiveFrom;
    }

    // 7. merge sectionNotifications by `key` (replace existing / append new)
    //    only when the stored doc already has a sectionNotifications array.
    if (input.sectionNotifications && permission.sectionNotifications) {
      for (const item of input.sectionNotifications) {
        const i = permission.sectionNotifications.findIndex(
          (x: Record<string, any>) => x.key === item.key
        );
        if (i !== -1) permission.sectionNotifications[i] = item;
        else permission.sectionNotifications.push(item);
      }
    }

    // 8. save keyed by userId ($set merged object, no _id inside) + read back.
    const { _id: _ignored, ...save } = permission;
    const saved = await upsertNotificationPermission(ownerId, save);

    // 9. success — serialize to the whitelisted setting fields.
    return {
      isSuccess: true,
      data: serializeSetting((saved ?? {}) as Record<string, any>),
      message: "updated successfully",
    };
  } catch (error) {
    return { isSuccess: false, data: null, message: "something went wrong", error };
  }
}
