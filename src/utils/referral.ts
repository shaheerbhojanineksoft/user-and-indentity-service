import { randomBytes } from "node:crypto";

/** Generate a unique alphanumeric referral code (default length 8). */
export function generateUniqueReferralCode(length = 8): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i]! % chars.length];
  }
  return code;
}
