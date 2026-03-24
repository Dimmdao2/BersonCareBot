"use client";

import type { OtpConfirmResult } from "./OtpCodeForm";
import { OtpCodeForm } from "./OtpCodeForm";

type SmsCodeFormProps = {
  challengeId: string;
  retryAfterSeconds?: number;
  onConfirm: (code: string) => Promise<OtpConfirmResult>;
  onResend: () => void;
  onBack: () => void;
};

export function SmsCodeForm({ challengeId, retryAfterSeconds, onConfirm, onResend, onBack }: SmsCodeFormProps) {
  return (
    <OtpCodeForm
      challengeId={challengeId}
      retryAfterSeconds={retryAfterSeconds}
      description="Код отправлен в SMS. Введите его ниже."
      submitLabel="Войти"
      onConfirm={onConfirm}
      onResend={onResend}
      onBack={onBack}
    />
  );
}

export type { OtpConfirmResult };
