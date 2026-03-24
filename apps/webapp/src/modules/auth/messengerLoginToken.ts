import { createHash, randomBytes } from "node:crypto";

/** Одноразовый токен для deep-link бота (`/start <token>`). */
export function createLoginTokenPlain(): string {
  return `login_${randomBytes(18).toString("base64url")}`;
}

export function hashLoginTokenPlain(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}
