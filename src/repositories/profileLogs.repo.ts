import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function profileLogs(): Promise<Collection<Document>> {
  return (await getDb()).collection("profileLogs");
}

export async function insertProfileLog(doc: Document): Promise<void> {
  await (await profileLogs()).insertOne(doc);
}
