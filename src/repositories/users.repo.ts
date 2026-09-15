import type { Collection, Document } from "mongodb";

import { getDb } from "./mongo";

async function users(): Promise<Collection<Document>> {
  return (await getDb()).collection("Users");
}

// `_id` can be a Keycloak UUID (string), so filters are loosely typed.
export async function findUser(filter: Record<string, any>): Promise<Document | null> {
  return (await users()).findOne(filter);
}

// Alias used by GET /users/me (matches the source repo naming).
export async function findOneUser(filter: Record<string, any>): Promise<Document | null> {
  return findUser(filter);
}

export async function findManyUsers(filter: Record<string, any>): Promise<Document[]> {
  return (await users()).find(filter).toArray();
}

export async function findUserByUsername(username: string): Promise<Document | null> {
  const users = await findManyUsers({ userName: username });
  return users[0] ?? null;
}

/**
 * Keycloak federated-auth lookup (`ALL /api/auth/getDetails/:id`).
 *
 * EXACT parity with the source query (spec §5):
 *   { $or: [ { userName: { $eq: id } }, { _id: { $eq: id } }, { email: { $eq: id } } ] }
 *
 * Notes kept deliberately:
 *   - case-SENSITIVE (`$eq`, no `$options: "i"`),
 *   - NO sort → the caller takes `users[0]`, so a collision (one user's
 *     `userName` === another's `email`) can resolve the wrong account.
 */
export async function findUsersByIdentifier(identifier: string): Promise<Document[]> {
  return findManyUsers({
    $or: [
      { userName: { $eq: identifier } },
      { _id: { $eq: identifier } },
      { email: { $eq: identifier } },
    ],
  });
}

export async function isUserNameTaken(userName: string): Promise<boolean> {
  const users = await findManyUsers({ userName });
  return users.length > 0;
}

export async function insertUser(user: Document): Promise<Document> {
  const result = await (await users()).insertOne(user);
  return { _id: result.insertedId, ...user };
}

export async function updateUser(
  filter: Record<string, any>,
  update: Document
): Promise<Document | null> {
  return (await users()).findOneAndUpdate(filter, update, { returnDocument: "after" });
}

export async function existsUserName(
  userName: string,
  excludeUserId: string
): Promise<boolean> {
  const q: Record<string, any> = { _id: { $ne: excludeUserId }, userName };
  return (await users()).findOne(q) !== null;
}

export async function deleteOneUser(filter: Record<string, any>): Promise<void> {
  await (await users()).deleteOne(filter);
}
