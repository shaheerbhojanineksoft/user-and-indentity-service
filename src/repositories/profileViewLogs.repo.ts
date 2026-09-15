import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function profileViewLogs(): Promise<Collection<Document>> {
  return (await getDb()).collection("ProfileViewLogs");
}

/**
 * Create the view log on first view (viewCount: 1), or increment it on
 * repeat views (viewCount + 1). Matches source `findOrIncrementViewLog`.
 */
export async function findOrIncrementViewLog(
  userId: string,
  connectionId: string,
  createData: Record<string, any>
): Promise<void> {
  const existing = await (await profileViewLogs()).findOne({ userId, connectionId });

  if (!existing) {
    const doc: Record<string, any> = {
      ...createData,
      _id: String(Date.now()),
      viewCount: 1,
    };
    await (await profileViewLogs()).insertOne(doc);
  } else {
    await (await profileViewLogs()).updateOne(
      { _id: existing._id },
      { $set: { viewCount: existing.viewCount + 1 } }
    );
  }
}
