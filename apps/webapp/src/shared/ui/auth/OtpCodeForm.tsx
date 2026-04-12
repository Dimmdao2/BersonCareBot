"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OTP_TOO_MANY_ATTEMPTS_MESSAGE } from "@/modules/auth/otpConstants";
import { DEFAULT_SUPPORT_CONTACT_URL } from "@/modules/system-settings/supportContactConstants";
import { isAppSupportPath } from "@/lib/url/isAppSupportPath";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";

export type OtpConfirmResult =
  | { ok: true; redirectTo?: string }
  | {
      ok: false;
      message: string;
      code?: string;
      retryAfterSeconds?: number;
    };

/** Результат повторной отправки кода (SMS / email). */
export type OtpResendOutcome =
  | { kind: "ok" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "error"; message: string };

/** Варианты в блоке «Другие способы» (доставка кода другим каналом). */
export type OtpAlternativeEntry = {
  label: string;
  /** true — текстовая ссылка вместо кнопки */
  asText?: boolean;
  onClick: () => void | Promise<void>;
};

type OtpCodeFormProps = {
  challengeId: string;
  retryAfterSeconds?: number;
  submitLabel?: string;
  description?: string;
  /** Раскрывающийся «Другие способы» с переотправкой на СМС (когда нет списка alternatives). */
  smsFallbackLink?: boolean;
  onRequestSms?: () => Promise<OtpResendOutcome>;
  /** Раскрывающийся список альтернативных каналов + ссылка в поддержку */
  alternatives?: OtpAlternativeEntry[];
  /** HTTPS ссылка в поддержку; из `system_settings.support_contact_url` (сервер) или дефолт. */
  supportContactHref?: string;
  onConfirm: (code: string) => Promise<OtpConfirmResult>;
  onResend: () => Promise<OtpResendOutcome>;
  onBack: () => void;
};

export function OtpCodeForm({
  challengeId,
  retryAfterSeconds = 60,
  submitLabel = "Подтвердить",
  description = "Введите код ниже.",
  smsFallbackLink = false,
  onRequestSms,
  alternatives,
  supportContactHref = DEFAULT_SUPPORT_CONTACT_URL,
  onConfirm,
  onResend,
  onBack,
}: OtpCodeFormProps) {
  function resolveSupportHref(raw: string): string {
    const t = raw.trim();
    if (isAppSupportPath(t)) return t;
    if (isSafeExternalHref(t)) return t;
    const d = DEFAULT_SUPPORT_CONTACT_URL.trim();
    if (isAppSupportPath(d)) return d;
    if (isSafeExternalHref(d)) return d;
    return DEFAULT_SUPPORT_CONTACT_URL;
  }

  const supportHref = resolveSupportHref(supportContactHref ?? "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(retryAfterSeconds);
  const [canResend, setCanResend] = useState(false);
  const [hardBlocked, setHardBlocked] = useState(false);
  const [altExpanded, setAltExpanded] = useState(false);
  const [smsFallbackExpanded, setSmsFallbackExpanded] = useState(false);

  /** Новый challenge / интервал после повторной отправки — сброс поля и таймера. */
  useEffect(() => {
    setCode("");
    setError(null);
    setHardBlocked(false);
    setResendCountdown(retryAfterSeconds);
    setCanResend(false);
    setAltExpanded(false);
    setSmsFallbackExpanded(false);
  }, [challengeId, retryAfterSeconds]);

  useEffect(() => {
    if (canResend) return;
    if (resendCountdown <= 0) {
      setCanResend(true);
      return;
    }
    const t = setInterval(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCountdown, canResend]);

  const handleResend = async () => {
    if (hardBlocked || resendLoading) return;
    setError(null);
    setResendLoading(true);
    try {
      const outcome = await onResend();
      if (outcome.kind === "rate_limited") {
        const sec = Math.max(1, Math.ceil(outcome.retryAfterSeconds));
        setCanResend(false);
        setResendCountdown(sec);
        return;
      }
      if (outcome.kind === "error") {
        setError(outcome.message);
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleRequestSms = async () => {
    if (!onRequestSms || hardBlocked || resendLoading) return;
    setError(null);
    setResendLoading(true);
    try {
      const outcome = await onRequestSms();
      if (outcome.kind === "rate_limited") {
        const sec = Math.max(1, Math.ceil(outcome.retryAfterSeconds));
        setCanResend(false);
        setResendCountdown(sec);
        return;
      }
      if (outcome.kind === "error") {
        setError(outcome.message);
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hardBlocked) return;
    setError(null);
    const raw = code.trim();
    if (!raw) {
      setError("Введите код");
      return;
    }
    setLoading(true);
    try {
      const result = await onConfirm(raw);
      if (result.ok) {
        return;
      }
      if (result.code === "too_many_attempts") {
        setHardBlocked(true);
        setError(OTP_TOO_MANY_ATTEMPTS_MESSAGE);
      } else if (result.code === "rate_limited" && result.retryAfterSeconds != null) {
        const sec = Math.max(1, Math.ceil(result.retryAfterSeconds));
        setCanResend(false);
        setResendCountdown(sec);
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id={`otp-code-form-${challengeId}`} onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
      <p className="text-muted-foreground text-sm">{description}</p>
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground text-xs font-medium uppercase tracking-wide" htmlFor={`otp-${challengeId}`}>
          Код подтверждения
        </label>
        <Input
          id={`otp-${challengeId}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={8}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          disabled={loading || hardBlocked}
          aria-invalid={!!error}
        />
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" disabled={loading || hardBlocked}>
        {loading ? "Проверка…" : submitLabel}
      </Button>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} disabled={loading}>
          Назад
        </Button>
        {canResend && !hardBlocked ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void handleResend()} disabled={loading || resendLoading}>
            {resendLoading ? "Отправка…" : "Отправить код повторно"}
          </Button>
        ) : !hardBlocked ? (
          <span className="text-muted-foreground text-sm">
            Повторная отправка возможна через {resendCountdown} сек
          </span>
        ) : null}
      </div>
      {smsFallbackLink && onRequestSms ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-fit text-sm text-muted-foreground underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setSmsFallbackExpanded((v) => !v)}
            disabled={loading || hardBlocked}
            aria-expanded={smsFallbackExpanded}
          >
            Другие способы
          </button>
          {smsFallbackExpanded ? (
            <button
              type="button"
              className="w-fit pl-1 text-left text-sm text-muted-foreground underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => void handleRequestSms()}
              disabled={loading || resendLoading || hardBlocked}
            >
              {resendLoading ? "Отправка…" : "Получить код по SMS"}
            </button>
          ) : null}
        </div>
      ) : null}
      {alternatives !== undefined && alternatives.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-fit text-sm text-muted-foreground underline hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setAltExpanded((v) => !v)}
            disabled={loading || resendLoading || hardBlocked}
            aria-expanded={altExpanded}
          >
            Другие способы
          </button>
          {altExpanded ? (
            <div className="flex flex-col gap-2 pl-1">
              {alternatives.map((alt, i) =>
                alt.asText ? (
                  <button
                    key={i}
                    type="button"
                    className="w-fit text-left text-sm text-muted-foreground underline"
                    onClick={() => void alt.onClick()}
                    disabled={loading || resendLoading || hardBlocked}
                  >
                    {alt.label}
                  </button>
                ) : (
                  <Button
                    key={i}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void alt.onClick()}
                    disabled={loading || resendLoading || hardBlocked}
                  >
                    {alt.label}
                  </Button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <SupportContactLink
        href={supportHref}
        className="w-fit text-sm text-muted-foreground underline hover:text-foreground"
      >
        Написать в поддержку
      </SupportContactLink>
    </form>
  );
}
