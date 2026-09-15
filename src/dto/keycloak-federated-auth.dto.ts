/**
 * Payload + response types for the Keycloak federated-auth endpoint
 * (`ALL /api/auth/getDetails/:id`) — used by the Keycloak User Storage SPI
 * to resolve a Traderverse user.
 *
 * SHAPE IS FROZEN (spec §3 / §6): do NOT add, rename or wrap fields — the SPI
 * maps this object to a `UserModel`, and callers depend on the raw
 * `UserRepresentation` (NOT the `ResponseModel` envelope used elsewhere).
 */
export interface KeyCloakFederatedAuthInput {
  /**
   * Plaintext password.
   * Optional at runtime (Swagger "required" in the source was wrong): when it
   * is absent/empty the credential check is SKIPPED entirely (spec §7.1).
   */
  password?: string;
}

/** Raw Keycloak `UserRepresentation` returned on success. */
export interface KeyCloakUserRepresentation {
  /** Mongo `_id` (= Keycloak user id — must stay stable). */
  id: string;
  /** Mongo `userName`; may be absent (phone-only user) → the 404 branch fires. */
  username?: string;
  /** PII — returned even when NO password was supplied (source parity). */
  email?: string;
  firstName: string;
  lastName: string;
  /** Hard-coded `true` in the source — account-state flags are NEVER checked. */
  enabled: boolean;
  /** `user.isEmailVerified`; `undefined` ⇒ the key is omitted from the JSON. */
  emailVerified?: boolean;
  roles: string[];
  groups: string[];
  requiredActions: string[];
  attributes: Record<string, string[]>;
  totps: string[];
  organizations: string[];
}
