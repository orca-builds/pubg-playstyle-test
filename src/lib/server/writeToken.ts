import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 random bytes = 256 bits of entropy, encoded as 43 base64url characters. */
export function generateWriteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash the original token's UTF-8 string, not its decoded random bytes. */
export function hashWriteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Untrusted request/DB inputs fail closed without exposing either value. */
export function verifyWriteToken(token: unknown, storedHash: unknown): boolean {
  if (typeof token !== "string" || token.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(token) ||
      typeof storedHash !== "string" || storedHash.length !== 64 || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  // Reject alternate spellings with unused base64 padding bits set.
  if (Buffer.from(token, "base64url").toString("base64url") !== token) return false;
  const actual = Buffer.from(hashWriteToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return timingSafeEqual(actual, expected);
}
