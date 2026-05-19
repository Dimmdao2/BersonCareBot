import type { EmailSetupAccessSource } from "@/modules/auth/emailSetupAccess/ports";
import { EMAIL_SETUP_TOKEN_TTL_MS } from "./constants";
import {
  generateEmailSetupTokenPlain,
  hashEmailSetupToken,
  isEmailSetupTokenPlainFormat,
} from "./tokenCrypto";
import type { EmailSetupTokensPort } from "./ports";

export type IssueEmailSetupTokenResult =
  | { ok: true; tokenPlain: string; tokenId: string }
  | { ok: false; reason: "database_error" };

export type ValidateEmailSetupTokenResult =
  | { ok: true; tokenId: string; userId: string; emailNormalized: string }
  | { ok: false; reason: "invalid_token" | "not_found" | "expired" | "used" | "revoked" };

export type LookupEmailSetupTokenResult =
  | { ok: true; status: "active"; tokenId: string; userId: string; emailNormalized: string }
  | { ok: true; status: "expired"; userId: string; emailNormalized: string }
  | { ok: false; reason: "invalid_token" | "not_found" | "used" | "revoked" };

export type ConsumeEmailSetupTokenResult = ValidateEmailSetupTokenResult;

function isActiveToken(row: {
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
}): { ok: true } | { ok: false; reason: "expired" | "used" | "revoked" } {
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (new Date(row.expiresAt).getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true };
}

export function createEmailSetupTokensService(port: EmailSetupTokensPort) {
  return {
    async issueEmailSetupToken(params: {
      userId: string;
      emailNormalized: string;
      source: EmailSetupAccessSource;
      createdByUserId?: string | null;
    }): Promise<IssueEmailSetupTokenResult> {
      const tokenPlain = generateEmailSetupTokenPlain();
      const tokenHash = hashEmailSetupToken(tokenPlain);
      const expiresAtIso = new Date(Date.now() + EMAIL_SETUP_TOKEN_TTL_MS).toISOString();

      try {
        await port.revokeActiveForUserEmail(params.userId, params.emailNormalized);
        const inserted = await port.insertToken({
          userId: params.userId,
          emailNormalized: params.emailNormalized,
          tokenHash,
          expiresAtIso,
          source: params.source,
          createdByUserId: params.createdByUserId ?? null,
        });
        return { ok: true, tokenPlain, tokenId: inserted.id };
      } catch {
        return { ok: false, reason: "database_error" };
      }
    },

    async lookupEmailSetupToken(tokenPlainRaw: string): Promise<LookupEmailSetupTokenResult> {
      const tokenPlain = tokenPlainRaw.trim();
      if (!isEmailSetupTokenPlainFormat(tokenPlain)) {
        return { ok: false, reason: "invalid_token" };
      }

      const row = await port.findByTokenHash(hashEmailSetupToken(tokenPlain));
      if (!row) return { ok: false, reason: "not_found" };
      if (row.revokedAt) return { ok: false, reason: "revoked" };
      if (row.usedAt) return { ok: false, reason: "used" };
      if (new Date(row.expiresAt).getTime() < Date.now()) {
        return { ok: true, status: "expired", userId: row.userId, emailNormalized: row.emailNormalized };
      }

      return {
        ok: true,
        status: "active",
        tokenId: row.id,
        userId: row.userId,
        emailNormalized: row.emailNormalized,
      };
    },

    async validateEmailSetupToken(tokenPlainRaw: string): Promise<ValidateEmailSetupTokenResult> {
      const tokenPlain = tokenPlainRaw.trim();
      if (!isEmailSetupTokenPlainFormat(tokenPlain)) {
        return { ok: false, reason: "invalid_token" };
      }

      const row = await port.findByTokenHash(hashEmailSetupToken(tokenPlain));
      if (!row) return { ok: false, reason: "not_found" };

      const active = isActiveToken(row);
      if (!active.ok) return { ok: false, reason: active.reason };

      return {
        ok: true,
        tokenId: row.id,
        userId: row.userId,
        emailNormalized: row.emailNormalized,
      };
    },

    async consumeEmailSetupToken(tokenPlainRaw: string): Promise<ConsumeEmailSetupTokenResult> {
      const validated = await this.validateEmailSetupToken(tokenPlainRaw);
      if (!validated.ok) return validated;

      const marked = await port.markUsedById(validated.tokenId);
      if (!marked) return { ok: false, reason: "used" };

      return validated;
    },

    async rollbackIssuedToken(tokenId: string): Promise<void> {
      await port.deleteTokenById(tokenId);
    },
  };
}

export type EmailSetupTokensService = ReturnType<typeof createEmailSetupTokensService>;
