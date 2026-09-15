import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function sections(): Promise<Collection<Document>> {
  return (await getDb()).collection("sections");
}

export async function findSection(filter: Record<string, any>): Promise<Document | null> {
  return (await sections()).findOne(filter);
}

export async function countSections(filter: Record<string, any>): Promise<number> {
  return (await sections()).countDocuments(filter);
}

export async function insertSection(doc: Document): Promise<void> {
  await (await sections()).insertOne(doc);
}
