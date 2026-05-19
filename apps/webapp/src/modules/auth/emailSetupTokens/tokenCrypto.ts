import { createHash, randomBytes } from "node:crypto";
import { integratorWebhookSecret } from "@/config/env";
import { EMAIL_SETUP_TOKEN_PREFIX } from "./constants";

function setupTokenPepper(): string {
  return integratorWebhookSecret() || "dev-email-setup-token";
}

export function hashEmailSetupToken(tokenPlain: string): string {
  return createHash("sha256").update(`${tokenPlain}:${setupTokenPepper()}`).digest("hex");
}

export function generateEmailSetupTokenPlain(): string {
  return `${EMAIL_SETUP_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function isEmailSetupTokenPlainFormat(token: string): boolean {
  return /^est_[A-Za-z0-9_-]+$/.test(token.trim());
}
