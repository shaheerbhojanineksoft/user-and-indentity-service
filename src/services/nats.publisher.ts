/**
 * NATS JetStream publisher for Users-Engine index events.
 *
 * Contract (see "NATS → Users-Engine Publisher Contract"):
 *   - `users.index.upsert`  -> publish AFTER the Mongo user write commits
 *   - `users.index.delete`  -> publish AFTER the Mongo user delete commits
 *   - payload is a UTF-8 JSON object containing ONLY `{ userId: string }`
 *   - publish via JetStream (persisted); PubAck confirms acceptance
 *   - stream names are FIXED: USERS_UPSERT_STREAM / USERS_DELETE_STREAM
 *
 * Every function here is best-effort and NEVER throws, so a NATS outage can
 * never break signup / recreate / delete flows in this service. Callers use
 * `void publish...()` to avoid adding any latency to the request path.
 */
import { connect, StorageType, StringCodec } from "nats";
import type { JetStreamClient, NatsConnection } from "nats";

import { constants } from "../config/constants";

const sc = StringCodec();

let nc: NatsConnection | null = null;
let js: JetStreamClient | null = null;
let connecting: Promise<void> | null = null;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logError(context: string, err: unknown): void {
  console.error(`[nats-publisher] ${context}: ${errMsg(err)}`);
}

/**
 * Ensure the JetStream streams exist (idempotent, safe to call every boot).
 * The users-engine indexer also creates them on startup; doing it here too
 * removes the "publish before stream exists = message lost" startup race.
 * Best-effort — never throws.
 */
async function ensureStreams(client: NatsConnection): Promise<void> {
  try {
    const jsm = await client.jetstreamManager();
    const streams = [
      { name: "USERS_UPSERT_STREAM", subjects: [constants.USER_INDEX_UPSERT_SUBJECT] },
      { name: "USERS_DELETE_STREAM", subjects: [constants.USER_INDEX_DELETE_SUBJECT] },
    ];
    for (const stream of streams) {
      try {
        await jsm.streams.add({
          name: stream.name,
          subjects: stream.subjects,
          storage: StorageType.File,
        });
      } catch (err) {
        // "stream name already in use" is expected when the engine created it first.
        if (!errMsg(err).includes("already in use")) {
          logError(`ensureStream ${stream.name}`, err);
        }
      }
    }
  } catch (err) {
    logError("ensureStreams", err);
  }
}

/**
 * Lazily connect (single shared connection, reused across publishes).
 * Never throws — returns null when NATS is unavailable (caller just skips).
 */
async function getJetStream(): Promise<JetStreamClient | null> {
  if (js) return js;

  if (!connecting) {
    connecting = (async () => {
      try {
        // Auth is sent only if BOTH user and password are non-blank.
        const hasAuth = Boolean(constants.NATS_USER && constants.NATS_PASSWORD);
        nc = await connect({
          servers: constants.NATS_URL,
          ...(hasAuth ? { user: constants.NATS_USER, pass: constants.NATS_PASSWORD } : {}),
        });
        await ensureStreams(nc);
        js = nc.jetstream();
        console.log(`[nats-publisher] ✅ connected to NATS at ${constants.NATS_URL}`);
      } catch (err) {
        logError("connect", err);
        nc = null;
        js = null;
      } finally {
        connecting = null; // allow a retry attempt on the next publish
      }
    })();
  }

  await connecting;
  return js;
}

function encodePayload(userId: string): Uint8Array {
  return sc.encode(JSON.stringify({ userId }));
}

/**
 * Publish a user created/updated event. Best-effort, never throws.
 * Call AFTER the Mongo write for `userId` has committed.
 */
export async function publishUserUpsert(userId: string): Promise<void> {
  try {
    const client = await getJetStream();
    if (!client) return;
    await client.publish(constants.USER_INDEX_UPSERT_SUBJECT, encodePayload(userId));
  } catch (err) {
    logError(`publish upsert userId=${userId}`, err);
  }
}

/**
 * Publish a user deleted event. Best-effort, never throws.
 * Call AFTER the Mongo delete for `userId` has committed.
 */
export async function publishUserDelete(userId: string): Promise<void> {
  try {
    const client = await getJetStream();
    if (!client) return;
    await client.publish(constants.USER_INDEX_DELETE_SUBJECT, encodePayload(userId));
  } catch (err) {
    logError(`publish delete userId=${userId}`, err);
  }
}

/**
 * Warm up the NATS connection when the service boots (best-effort).
 * Logs success / failure on the console but NEVER blocks or fails startup.
 */
export function connectNats(): void {
  void getJetStream();
}
