import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function blocked(): Promise<Collection<Document>> {
  return (await getDb()).collection("Blocked");
}

/** Is either direction of this pair blocked? (user→blockedId OR blockedId→user) */
export async function existsInBlocked(userId: string, blockedId: string): Promise<boolean> {
  const doc = await (await blocked()).findOne({
    $or: [
      { userId, blockedId },
      { userId: blockedId, blockedId: userId },
    ],
  });
  return doc !== null;
}
