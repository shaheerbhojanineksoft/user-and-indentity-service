import { randomUUID } from "node:crypto";

import { constants } from "../config/constants";
import { findAffiliateReferralByUserId } from "../repositories/affiliate.repo";
import {
  countConnections,
  findManyConnections,
  insertManyConnections,
} from "../repositories/connections.repo";
import { findManyUsers, updateUser } from "../repositories/users.repo";

/**
 * Founder auto-follow — Bun/in-service port of the source
 * `followFoundersForUser()` (socialmedia microservice).
 *
 * WHAT IT DOES
 *   Makes one user FOLLOW every id in `FOUNDER_IDS` (comma separated Mongo
 *   `_id`s) PLUS the user's affiliate referrer, by writing `following` rows into
 *   the `Connections` collection of THIS service's DB.
 *
 * SELF-CONTAINED (per project decision): no TCP/NATS/external HTTP call — the
 * founder docs, the referrer lookup, the follow rows and the `followingCount`
 * recount all happen through this service's own Mongo connection. The source
 * also POSTed `USER_SERVICE/connections/add` and published a KEDA
 * `addinitialposts` event; neither exists in the Bun stack yet (see the notes
 * at the bottom), so they are intentionally not reproduced.
 *
 * IDEMPOTENT (deliberate improvement over the source, which inserted duplicate
 * rows on every call): founders the user already follows are skipped.
 *
 * Callers: `updateProfile()` (PUT /users) — only on the FIRST favourite-investment
 * completion. Never throws; failures are logged and returned as counters.
 */
export interface FollowFoundersResult {
  /** New `following` rows inserted. */
  followed: number;
  /** Founders that were already followed (or not found) and were skipped. */
  skipped: number;
  /** Resolved founder ids (env list + referrer, de-duplicated, self removed). */
  founderIds: string[];
}

/** `FOUNDER_IDS` env → trimmed, non-empty, de-duplicated ids. */
export function getFounderIdsFromEnv(): string[] {
  return [
    ...new Set(
      (constants.FOUNDER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
}

/**
 * The user's affiliate referrer id: `affiliate_referral` (by userId) → its
 * `email` → that user's `_id`. Source: `getFollowFounderIds()`.
 */
export async function getReferrerId(userId: string): Promise<string | null> {
  const referral = await findAffiliateReferralByUserId(userId);
  const email = typeof referral?.email === "string" ? referral.email : "";
  if (!email) return null;

  const referrer = await findManyUsers({ email });
  const id = referrer[0]?._id;
  return id ? String(id) : null;
}

/**
 * @param user the CURRENT user document (`_id` + the profile fields copied onto
 *             every connection row). Passing the freshly read doc keeps the
 *             connection rows consistent with the final update.
 */
export async function followFoundersForUser(
  user: Record<string, any>
): Promise<FollowFoundersResult> {
  const result: FollowFoundersResult = { followed: 0, skipped: 0, founderIds: [] };

  try {
    const userId = user?._id ? String(user._id) : "";
    if (!userId) return result;

    // 1+2. Founder ids = env list + the affiliate referrer, de-duplicated, and
    //      never the user itself.
    const referrerId = await getReferrerId(userId);
    const founderIds = [
      ...new Set([...getFounderIdsFromEnv(), ...(referrerId ? [referrerId] : [])]),
    ].filter((id) => id !== userId);
    result.founderIds = founderIds;

    // Empty founder list ⇒ nothing to do (source returned true silently).
    if (founderIds.length === 0) return result;

    // 3. Founder docs — ids that do not exist in `Users` are silently skipped.
    const founders = await findManyUsers({ _id: { $in: founderIds } });
    if (founders.length === 0) return result;

    // 3b. Idempotency — skip the founders this user already follows.
    const alreadyFollowed = await findManyConnections({
      userId,
      requestType: "following",
      connectionId: { $in: founderIds },
    });
    const alreadyIds = new Set(alreadyFollowed.map((row) => String(row.connectionId)));

    const now = Date.now();
    const docs = founders
      .filter((founder) => !alreadyIds.has(String(founder._id)))
      .map((founder) => ({
        // Source generated a fresh uuid per row (carried in the upsert findQuery).
        _id: randomUUID(),
        connectionCoverPhoto: founder.coverPhoto,
        connectionId: String(founder._id),
        connectionName: founder.fullName,
        connectionProfilePicture: founder.profilePicture,
        connectionUsername: founder.userName,
        createdOn: now,
        modifiedBy: "",
        modifiedOn: now,
        requestType: "following",
        userCoverPhoto: user?.coverPhoto,
        userFullName: user?.fullName,
        userGender: user?.gender,
        userId,
        userName: user?.userName,
        userProfilePicture: user?.profilePicture,
        userCountry: user?.country,
      }));

    result.skipped = founders.length - docs.length;

    if (docs.length > 0) {
      // 4. ONE unordered bulk write (source: initializeUnorderedBulkOp).
      result.followed = await insertManyConnections(docs);

      // 5. `followingCount` = FULL recount of the user's following rows
      //    (drift-free, exactly like the source — not an increment).
      const followingCount = await countConnections({ userId, requestType: "following" });
      await updateUser({ _id: userId }, { $set: { followingCount } });
    }

    console.log(
      `[follow-founders] userId=${userId} followed=${result.followed} ` +
        `skipped=${result.skipped} found=${founders.length}`
    );
  } catch (err) {
    // Source: log + return false. Here: log + return the counters so far —
    // the caller (PUT /users) must never fail because of this side-effect.
    console.error("[follow-founders] followFoundersForUser error:", err);
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* NOT ported (no equivalent infra in the Bun stack yet):             */
/*   - POST {USER_SERVICE_HOST}:{USER_SERVICE_PORT}/connections/add   */
/*     (one best-effort call per founder in the source),              */
/*   - KEDA publish { event: "addinitialposts", userId },             */
/*   - NATS social.followed (connection-service publishes that event  */
/*     for the edges IT creates).                                     */
/* Add them here when those targets exist.                            */
/* ------------------------------------------------------------------ */
