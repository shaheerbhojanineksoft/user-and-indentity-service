import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function reportedBugs(): Promise<Collection<Document>> {
  return (await getDb()).collection("reportedbugs");
}

/** Upsert a reported-bug doc by its `_id` (UUID) and return it. */
export async function upsertReportedBug(doc: Record<string, any>): Promise<Document> {
  const filter: Record<string, any> = { _id: doc._id };
  await (await reportedBugs()).replaceOne(filter, doc, { upsert: true });
  return doc as Document;
}

/** Paginated bugs of a single owner, newest first. */
export async function findReportedBugsByOwner(
  ownerId: string,
  skip: number,
  limit: number
): Promise<Document[]> {
  const filter: Record<string, any> = { ownerId };
  return (await reportedBugs())
    .find(filter)
    .sort({ createdOn: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

/** Total count of a single owner's bugs (no pagination). */
export async function countReportedBugsByOwner(ownerId: string): Promise<number> {
  const filter: Record<string, any> = { ownerId };
  return (await reportedBugs()).countDocuments(filter);
}
