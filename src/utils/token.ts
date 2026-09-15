import { SignJWT } from "jose";

import { constants } from "../config/constants";

/**
 * Internal app JWT used as the login token.
 * NOTE: the source signs with its own settings — keep JWT_SECRET consistent
 * with the original microservice so tokens remain interchangeable.
 */
export async function createToken(payload: { _id: string }): Promise<string> {
  const secret = new TextEncoder().encode(constants.JWT_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}
