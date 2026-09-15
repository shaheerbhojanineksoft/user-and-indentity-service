import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function notificationPermission(): Promise<Collection<Document>> {
  return (await getDb()).collection("notificationPermission");
}

/** The permission doc for a user (its `_id` IS the userId). */
export async function findNotificationPermission(
  userId: string
): Promise<Document | null> {
  const filter: Record<string, any> = { _id: userId };
  return (await notificationPermission()).findOne(filter);
}

/** Upsert the default setting doc by `_id = userId` and read it back. */
export async function upsertNotificationPermission(
  userId: string,
  doc: Record<string, any>
): Promise<Document | null> {
  const col = await notificationPermission();
  const filter: Record<string, any> = { _id: userId };
  await col.updateOne(filter, { $set: doc }, { upsert: true });
  return col.findOne({ _id: userId } as any);
}
