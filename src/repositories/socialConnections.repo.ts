import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function socialConnections(): Promise<Collection<Document>> {
  return (await getDb()).collection("social_connections");
}

export async function findSocialConnection(userId: string): Promise<Document | null> {
  return (await socialConnections()).findOne({ userId });
}
