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

export async function deleteOneConnection(filter: Record<string, any>): Promise<void> {
  await (await connections()).deleteOne(filter);
}
