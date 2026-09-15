import { constants } from "../config/constants";

/** Keycloak issuer = {base}/realms/{realm} (with trailing-slash safety). */
export function getIssuer(): string {
  const base = constants.KEYCLOAK_BASE_URL;
  return `${base.endsWith("/") ? base : base + "/"}realms/${constants.KEYCLOAK_REALM_NAME}`;
}

let cachedMasterToken: { token: string; expiresAt: number } | null = null;

/** Get a Keycloak admin token (client_credentials) with caching. */
export async function getMasterToken(): Promise<string> {
  if (cachedMasterToken && cachedMasterToken.expiresAt > Date.now()) {
    return cachedMasterToken.token;
  }

  const url = `${getIssuer()}/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: constants.KEYCLOAK_CLIENT_ID,
    client_secret: constants.KEYCLOAK_CLIENT_SECRET,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`[keycloak] master token request failed: ${res.status}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const ttl = ((data.expires_in ?? 60) - 30) * 1000; // refresh 30s early
  cachedMasterToken = { token: data.access_token, expiresAt: Date.now() + ttl };
  return data.access_token;
}

/** Fetch a Keycloak user's details via the Admin REST API. Returns null on 404/error. */
export async function getUserDetails(userId: string): Promise<any | null> {
  try {
    const token = await getMasterToken();
    const url = `${constants.KEYCLOAK_BASE_URL}/admin/realms/${constants.KEYCLOAK_REALM_NAME}/users/${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getUserDetails failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[keycloak] getUserDetails error:", err);
    return null;
  }
}

/** PUT a user's username via the Admin REST API. */
export async function changeUserName(userId: string, userName: string): Promise<void> {
  const token = await getMasterToken();
  const url = `${constants.KEYCLOAK_BASE_URL}/admin/realms/${constants.KEYCLOAK_REALM_NAME}/users/${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ username: userName }),
  });
  if (!res.ok) throw new Error(`[keycloak] changeUserName failed: ${res.status}`);
}

/** PUT a user's email via the Admin REST API. */
export async function changeEmail(userId: string, email: string): Promise<void> {
  const token = await getMasterToken();
  const url = `${constants.KEYCLOAK_BASE_URL}/admin/realms/${constants.KEYCLOAK_REALM_NAME}/users/${encodeURIComponent(userId)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`[keycloak] changeEmail failed: ${res.status}`);
}

/**
 * Verify a user's current password against Keycloak via a password-grant
 * token request (the Bun equivalent of the auth-microservice
 * "verifyCurrentPassword" command).
 */
export async function verifyCurrentPassword(
  userId: string,
  currentPassword: string
): Promise<boolean> {
  try {
    const userDetails = await getUserDetails(userId);
    const username = userDetails?.username;
    if (!username || !currentPassword) return false;

    const body = new URLSearchParams({
      grant_type: "password",
      client_id: constants.KEYCLOAK_PUBLIC_CLIENT_ID,
      username,
      password: currentPassword,
    });
    const res = await fetch(`${getIssuer()}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    return res.ok;
  } catch (err) {
    console.error("[keycloak] verifyCurrentPassword error:", err);
    return false;
  }
}
