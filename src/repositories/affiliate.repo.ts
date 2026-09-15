import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function affiliate(): Promise<Collection<Document>> {
  return (await getDb()).collection("affiliate_referral");
}

export async function upsertAffiliateReferral(doc: Document): Promise<void> {
  const filter = doc.userId ? { userId: doc.userId } : { email: doc.email };
  await (await affiliate()).updateOne(filter, { $set: doc }, { upsert: true });
}
