import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 of a string, hex-encoded. */
export function hmacSha256(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("hex");
}

/**
 * Verify the `x-keycloak-signature` header.
 * Expected = HMAC-SHA256(exact JSON string of the body, secret), hex-encoded.
 * Comparison is timing-safe (never `===`).
 */
export function verifyWebhookSignature(
  bodyString: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = hmacSha256(bodyString, secret);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** SHA-256 hex of `value.trim()` (used for Meta CAPI hashing). */
export function toSha256(value: string): string {
  return createHash("sha256").update(value.trim(), "utf8").digest("hex");
}
