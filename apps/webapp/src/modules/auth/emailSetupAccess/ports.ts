/** Источник выпуска setup-link (см. MAIN PLAN §9, PHASE_03). */
export type EmailSetupAccessSource =
  | "rubitime"
  | "doctor_profile"
  | "manual_resend"
  | "registration_claim";

export type RequestContactEmailSetupParams = {
  userId: string;
  emailNormalized: string;
  source: EmailSetupAccessSource;
  createdByUserId?: string | null;
};

export type RequestContactEmailSetupResult =
  | { ok: true; status: "enqueued" }
  | { ok: true; status: "stub_pending_phase3" }
  | { ok: false; reason: "invalid_email" | "not_configured" };

export type EmailSetupAccessPort = {
  /** Contact/unverified email: выпуск setup token + письмо со ссылкой на `/app/auth/email-setup`. */
  requestContactEmailSetup(
    params: RequestContactEmailSetupParams,
  ): Promise<RequestContactEmailSetupResult>;
};
