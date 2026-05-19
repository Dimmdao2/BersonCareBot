import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";
import type { EmailSetupTokensService } from "@/modules/auth/emailSetupTokens/service";
import { hashPin } from "@/modules/auth/pinHash";
import type { EmailSetupFlowPort } from "./ports";

export type ValidateEmailSetupFormResult =
  | { ok: true; email: string; status: "ready" }
  | { ok: false; error: "expired"; email: string }
  | { ok: false; error: "invalid_token" | "used" | "revoked" | "email_mismatch" | "already_has_login" };

export type CompleteEmailSetupResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "expired"
        | "used"
        | "revoked"
        | "email_mismatch"
        | "already_has_login"
        | "invalid_password"
        | "server_error";
    };

export type ResendEmailSetupResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "invalid_token"
        | "used"
        | "revoked"
        | "email_mismatch"
        | "already_has_login"
        | "not_configured";
    };

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export function createEmailSetupFlowService(deps: {
  tokens: EmailSetupTokensService;
  flowPort: EmailSetupFlowPort;
  emailSetupAccess: EmailSetupAccessService;
}) {
  async function checkContact(
    userId: string,
    emailNormalized: string,
  ): Promise<
    | { ok: true; email: string }
    | { ok: false; reason: "email_mismatch" | "already_has_login" | "user_not_found" }
  > {
    const contact = await deps.flowPort.assertContactEmailForSetup({ userId, emailNormalized });
    if (!contact.ok) {
      if (contact.reason === "already_has_login") {
        return { ok: false, reason: "already_has_login" };
      }
      return { ok: false, reason: contact.reason === "user_not_found" ? "user_not_found" : "email_mismatch" };
    }
    return { ok: true, email: contact.email };
  }

  return {
    async validateTokenForForm(tokenPlain: string): Promise<ValidateEmailSetupFormResult> {
      const lookup = await deps.tokens.lookupEmailSetupToken(tokenPlain);
      if (!lookup.ok) {
        const err =
          lookup.reason === "used"
            ? "used"
            : lookup.reason === "revoked"
              ? "revoked"
              : "invalid_token";
        return { ok: false, error: err };
      }

      const contact = await checkContact(lookup.userId, lookup.emailNormalized);
      if (!contact.ok) {
        if (contact.reason === "already_has_login") {
          return { ok: false, error: "already_has_login" };
        }
        return { ok: false, error: "email_mismatch" };
      }

      if (lookup.status === "expired") {
        return { ok: false, error: "expired", email: contact.email };
      }

      return { ok: true, email: contact.email, status: "ready" };
    },

    async completeEmailSetup(tokenPlain: string, plainPassword: string): Promise<CompleteEmailSetupResult> {
      if (plainPassword.length < PASSWORD_MIN || plainPassword.length > PASSWORD_MAX) {
        return { ok: false, error: "invalid_password" };
      }

      const validated = await deps.tokens.validateEmailSetupToken(tokenPlain);
      if (!validated.ok) {
        const err =
          validated.reason === "expired"
            ? "expired"
            : validated.reason === "used"
              ? "used"
              : validated.reason === "revoked"
                ? "revoked"
                : "invalid_token";
        return { ok: false, error: err };
      }

      const contact = await checkContact(validated.userId, validated.emailNormalized);
      if (!contact.ok) {
        if (contact.reason === "already_has_login") {
          return { ok: false, error: "already_has_login" };
        }
        return { ok: false, error: "email_mismatch" };
      }

      const passwordHash = await hashPin(plainPassword);
      const applied = await deps.flowPort.applyEmailSetupCompletion({
        userId: validated.userId,
        emailNormalized: validated.emailNormalized,
        passwordHash,
      });
      if (!applied.ok) {
        return { ok: false, error: applied.reason === "email_mismatch" ? "email_mismatch" : "server_error" };
      }

      const consumed = await deps.tokens.consumeEmailSetupToken(tokenPlain);
      if (!consumed.ok) {
        return { ok: false, error: "server_error" };
      }

      return { ok: true, userId: validated.userId };
    },

    async resendFromExpiredToken(tokenPlain: string): Promise<ResendEmailSetupResult> {
      const lookup = await deps.tokens.lookupEmailSetupToken(tokenPlain);
      if (!lookup.ok) {
        const err = lookup.reason === "used" ? "used" : lookup.reason === "revoked" ? "revoked" : "invalid_token";
        return { ok: false, error: err };
      }
      if (lookup.status !== "expired") {
        return { ok: false, error: "invalid_token" };
      }

      const contact = await checkContact(lookup.userId, lookup.emailNormalized);
      if (!contact.ok) {
        if (contact.reason === "already_has_login") {
          return { ok: false, error: "already_has_login" };
        }
        return { ok: false, error: "email_mismatch" };
      }

      const sent = await deps.emailSetupAccess.requestContactEmailSetup({
        userId: lookup.userId,
        emailNormalized: lookup.emailNormalized,
        source: "manual_resend",
      });
      if (!sent.ok || sent.status !== "enqueued") {
        return { ok: false, error: "not_configured" };
      }

      return { ok: true };
    },
  };
}

export type EmailSetupFlowService = ReturnType<typeof createEmailSetupFlowService>;
