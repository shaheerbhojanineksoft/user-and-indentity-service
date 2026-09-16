import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function affiliate(): Promise<Collection<Document>> {
  return (await getDb()).collection("affiliate_referral");
}

export async function upsertAffiliateReferral(doc: Document): Promise<void> {
  const filter = doc.userId ? { userId: doc.userId } : { email: doc.email };
  await (await affiliate()).updateOne(filter, { $set: doc }, { upsert: true });
}

/**
 * The affiliate-referral row of a user (used by the founder auto-follow to
 * resolve the user's referrer). Returns null when the user was not referred.
 */
export async function findAffiliateReferralByUserId(
  userId: string
): Promise<Document | null> {
  return (await affiliate()).findOne({ userId });
}
