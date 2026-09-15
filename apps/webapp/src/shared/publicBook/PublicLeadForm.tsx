'use client';

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { BookingFormFieldRecord } from '@/modules/booking-form/ports';
import { PasswordAltchaChallenge } from '@/shared/ui/auth/PasswordAltchaChallenge';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
import { notificationText } from '@/shared/notifications/notificationText';

type Props = { orgSlug: string; sourceSurface: 'public_page' | 'widget' };
type Values = Record<string, string>;
type ApiBody = { ok?: boolean; error?: string; message?: string; challengeId?: string };

const SUPPORTED_FIELDS = new Set([
  'last_name',
  'first_name',
  'patronymic',
  'email',
  'phone',
  'preferred_contact',
  'message',
]);

export function PublicLeadForm({ orgSlug, sourceSurface }: Props) {
  const [fields, setFields] = useState<BookingFormFieldRecord[] | null>(null);
  const [values, setValues] = useState<Values>({});
  const [consent, setConsent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'otp' | 'captcha' | 'done'>('form');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onCaptchaVerified = useCallback((payload: string | null) => setCaptcha(payload), []);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/leads/public/form-fields?orgSlug=${encodeURIComponent(orgSlug)}`)
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          fields?: BookingFormFieldRecord[];
        } | null;
        if (!response.ok || !data?.ok || !data.fields) throw new Error('load_failed');
        if (!cancelled)
          setFields(data.fields.filter((field) => SUPPORTED_FIELDS.has(field.fieldKey)));
      })
      .catch(() => {
        if (!cancelled) setError(notificationText.leadFormLoadFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const email = values.email?.trim() ?? '';

  async function startEmailVerification() {
    // Дверь заявки, а НЕ общая регистрация пациента: там ФИО обязательны, и клиника, выключившая
    // их в форме, не могла принять ни одной заявки вообще.
    const response = await fetch('/api/leads/public/email-otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        firstName: values.first_name ?? '',
        lastName: values.last_name ?? '',
        patronymic: values.patronymic ?? '',
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ApiBody;
    if (!response.ok || data.ok !== true) throw new Error(data.error ?? 'verification_failed');
    setStep('otp');
  }

  async function submitLead(captchaPayload?: string) {
    const response = await fetch('/api/leads/public/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orgSlug,
        firstName: values.first_name,
        lastName: values.last_name,
        patronymic: values.patronymic,
        email,
        phone: values.phone,
        preferredContact: values.preferred_contact,
        messageText: values.message,
        sourceSurface,
        personalDataConsent: consent,
        captcha: captchaPayload,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ApiBody;
    if (response.ok && data.ok === true) {
      setStep('done');
      return;
    }
    if (data.error === 'lead_email_verification_required') {
      await startEmailVerification();
      return;
    }
    if (data.error === 'captcha_required') {
      setStep('captcha');
      return;
    }
    throw new Error(data.error ?? 'lead_submit_failed');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!consent) {
      setError(notificationText.leadConsentRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await submitLead(captcha ?? undefined);
    } catch (cause) {
      setError(
        errorCodeText(
          cause instanceof Error ? cause.message : null,
          notificationText.leadSubmitFailed,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  async function confirmCode() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = (await response.json().catch(() => ({}))) as ApiBody;
      if (!response.ok || data.ok !== true) throw new Error(data.error ?? 'verification_failed');
      setStep('captcha');
    } catch (cause) {
      setError(
        errorCodeText(
          cause instanceof Error ? cause.message : null,
          notificationText.authConfirmationFailed,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  if (step === 'done') {
    return (
      <p className="text-sm font-medium" role="status">
        {notificationText.leadSubmitted}
      </p>
    );
  }
  if (!fields) {
    return error ? <p className="text-sm text-destructive">{error}</p> : null;
  }

  return (
    <form id="lead-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {fields.map((field) => {
        // Обязательность поля — настройка КЛИНИКИ и только она. Зашитые сюда «имя и фамилия всегда
        // обязательны» делали необязательное поле обязательным мимо её выбора.
        const required = field.isRequired;
        const common = {
          id: `lead-${field.fieldKey}`,
          name: field.fieldKey,
          required,
          value: values[field.fieldKey] ?? '',
          placeholder: field.placeholder ?? undefined,
          onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues((current) => ({ ...current, [field.fieldKey]: event.target.value })),
          className: 'w-full rounded-md border bg-background px-3 py-2 text-sm',
        };
        return (
          <label key={field.fieldKey} className="grid gap-1 text-sm" htmlFor={common.id}>
            <span className="font-medium">{field.label}</span>
            {field.fieldKey === 'message' ? (
              <textarea {...common} rows={5} />
            ) : (
              <input
                {...common}
                type={
                  field.fieldKey === 'email' ? 'email' : field.fieldKey === 'phone' ? 'tel' : 'text'
                }
                autoComplete={
                  field.fieldKey === 'email'
                    ? 'email'
                    : field.fieldKey === 'phone'
                      ? 'tel'
                      : undefined
                }
              />
            )}
          </label>
        );
      })}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>Согласен на обработку персональных данных</span>
      </label>

      {step === 'otp' ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{notificationText.leadVerificationCodeSent}</span>
            <input
              className="rounded-md border bg-background px-3 py-2"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            disabled={pending || !code.trim()}
            onClick={() => void confirmCode()}
          >
            Подтвердить email
          </button>
        </div>
      ) : null}

      {step === 'captcha' ? (
        <PasswordAltchaChallenge
          endpoint="/api/leads/public/captcha"
          email={email}
          onVerified={onCaptchaVerified}
        />
      ) : null}

      {step !== 'otp' ? (
        <button
          type="submit"
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          disabled={pending || (step === 'captcha' && !captcha)}
        >
          Отправить заявку
        </button>
      ) : null}
      <p aria-live="polite" className="text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
