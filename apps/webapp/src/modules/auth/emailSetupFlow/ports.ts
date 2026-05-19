export type EmailSetupContactCheckResult =
  | { ok: true; email: string }
  | {
      ok: false;
      reason: "user_not_found" | "email_mismatch" | "already_has_login";
    };

export type EmailSetupFlowPort = {
  /** Текущий contact email пользователя совпадает с токеном и ещё нет полноценного входа по паролю. */
  assertContactEmailForSetup(params: {
    userId: string;
    emailNormalized: string;
  }): Promise<EmailSetupContactCheckResult>;

  /** Подтвердить email, записать пароль и пометить setup-токен использованным (одна транзакция). */
  applyEmailSetupCompletion(params: {
    userId: string;
    emailNormalized: string;
    passwordHash: string;
    setupTokenId: string;
  }): Promise<{ ok: true } | { ok: false; reason: "user_not_found" | "email_mismatch" | "token_consume_failed" }>;
};
