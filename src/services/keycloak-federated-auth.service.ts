import bcrypt from "bcryptjs";

import type { KeyCloakUserRepresentation } from "../dto/keycloak-federated-auth.dto";
import { findUsersByIdentifier } from "../repositories/users.repo";
import { HttpException } from "../utils/http-exception";

/**
 * Keycloak federated auth — user lookup + credential check (spec §4.3).
 *
 * SELF-CONTAINED: the source deployed this in a separate Nest TCP microservice
 * (`cmd: "keyCloakFederatedAuth"`); here the exact same logic runs in-process —
 * the Users collection of this service's own DB (`Traderverse-Authentication`)
 * is queried directly and bcrypt is verified locally. No external/TCP/HTTP call.
 *
 * Behaviour is a FAITHFUL port (spec §6 / §7) — no extra validation, no
 * account-state checks, no lockout, no auditing:
 *   - unknown identifier                → HttpException 422 (caller still answers 500),
 *   - `bcrypt.compare` rejects for a user WITHOUT a local password (Keycloak-
 *     provisioned users) — the rejection propagates as-is,
 *   - `enabled` is hard-coded `true`.
 */

/** Build the raw Keycloak `UserRepresentation` returned to the SPI. */
function toKeyCloakUserRepresentation(
  user: Record<string, any>
): KeyCloakUserRepresentation {
  // `firstName`/`lastName` come from splitting `fullName` on a single space —
  // only the 2nd word is used ("John Ronald Doe" → lastName "Ronald") and a
  // one-word name duplicates the first name (spec §6.1).
  const nameParts = String(user.fullName ?? "").split(" ");

  return {
    id: String(user._id),
    username: user.userName,
    email: user.email,
    firstName: nameParts[0] ?? "",
    lastName: nameParts[1] || nameParts[0] || "",
    enabled: true, // hard-coded — isDeleted / isBanned / isLoginBlocked / loginLog.locked are NOT checked
    emailVerified: user.isEmailVerified,
    roles: [],
    groups: [],
    requiredActions: [],
    attributes: {},
    totps: [],
    organizations: [],
  };
}

/**
 * @param id       already URL-decoded identifier (userName | Mongo _id | email)
 * @param password `password || ""` from the caller — `""` skips the check
 */
export async function keyCloakFederatedAuth(
  id: string,
  password: string
): Promise<KeyCloakUserRepresentation> {
  console.log("[keycloak] HIT by keycloak");

  const users = await findUsersByIdentifier(id);

  if (users.length === 0) {
    // Same error + status as the source microservice.
    throw new HttpException("Invalid user or password!", 422);
  }

  // First document of an UNSORTED `$or` match (spec §5 / §7.6).
  const user = users[0];
  if (!user) {
    throw new HttpException("Invalid user or password!", 422);
  }

  // Verified ONLY when a password was actually sent (spec §7.1). When the user
  // has no stored hash, `bcrypt.compare(pw, undefined)` rejects — intentional
  // parity (spec §7.2), it propagates to the caller as a 500.
  if (password) {
    const matches = await bcrypt.compare(password, user.password as string);
    if (!matches) {
      throw new HttpException("Invalid user or password!", 422);
    }
  }

  return toKeyCloakUserRepresentation(user);
}
