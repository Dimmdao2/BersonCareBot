"use client";

import type { OtpConfirmResult, OtpResendOutcome } from "./OtpCodeForm";
import { OtpCodeForm } from "./OtpCodeForm";

type SmsCodeFormProps = {
  challengeId: string;
  retryAfterSeconds?: number;
  description?: string;
  smsFallbackLink?: boolean;
  onRequestSms?: () => Promise<OtpResendOutcome>;
  onConfirm: (code: string) => Promise<OtpConfirmResult>;
  onResend: () => Promise<OtpResendOutcome>;
  onBack: () => void;
};

export function SmsCodeForm({
  challengeId,
  retryAfterSeconds,
  description = "Код отправлен по SMS. Введите его ниже.",
  smsFallbackLink,
  onRequestSms,
  onConfirm,
  onResend,
  onBack,
}: SmsCodeFormProps) {
  return (
    <OtpCodeForm
      challengeId={challengeId}
      retryAfterSeconds={retryAfterSeconds}
      description={description}
      submitLabel="Войти"
      smsFallbackLink={smsFallbackLink}
      onRequestSms={onRequestSms}
      onConfirm={onConfirm}
      onResend={onResend}
      onBack={onBack}
    />
  );
}

export type { OtpConfirmResult, OtpResendOutcome };
