import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function connections(): Promise<Collection<Document>> {
  return (await getDb()).collection("Connections");
}

/** Does a connection (following/friends/friendrequest) exist for this pair? */
export async function existsInConnections(
  userId: string,
  connectionId: string,
  requestType: string,
  requestStatus?: string
): Promise<boolean> {
  const q: Record<string, any> = { userId, connectionId, requestType };
  if (requestStatus) q.requestStatus = requestStatus;
  return (await connections()).findOne(q) !== null;
}

export async function findManyConnections(filter: Record<string, any>): Promise<Document[]> {
  return (await connections()).find(filter).toArray();
}

/** Number of connection rows matching the filter (used for the full recounts). */
export async function countConnections(filter: Record<string, any>): Promise<number> {
  return (await connections()).countDocuments(filter);
}

/**
 * Insert follow/connection rows in ONE unordered bulk write (used by the
 * founder auto-follow). Unordered = one bad row never blocks the others.
 * Returns the number of inserted documents.
 */
export async function insertManyConnections(docs: Document[]): Promise<number> {
  if (docs.length === 0) return 0;
  const { insertedCount } = await (await connections()).insertMany(docs, {
    ordered: false,
  });
  return insertedCount;
}

export async function deleteOneConnection(filter: Record<string, any>): Promise<void> {
  await (await connections()).deleteOne(filter);
}
