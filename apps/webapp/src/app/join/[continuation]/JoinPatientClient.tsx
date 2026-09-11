'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LegalFooterLinks } from '@/shared/ui/patient/LegalFooterLinks';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import { Button } from '@/shared/ui/patient/primitives/button';
import { Input } from '@/shared/ui/patient/primitives/input';
import type {
  PatientInviteLifecycleCode,
  PatientInvitePublicPreview,
} from '@/modules/patient-invites/ports';

type ApiResult = {
  ok?: unknown;
  error?: unknown;
  redirectTo?: unknown;
  retryAfterSeconds?: unknown;
};

async function request(
  path: string,
  body: Record<string, string>,
): Promise<{ response: Response; json: ApiResult }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = (await response.json().catch(() => ({}))) as ApiResult;
  return { response, json };
}

function messageFor(code: unknown): string {
  switch (code) {
    case 'wrong_recipient':
      return 'Этот email не соответствует приглашению. Проверьте адрес и попробуйте ещё раз.';
    case 'conflicting_identity':
      return 'Этот адрес уже связан с другой учётной записью. Обратитесь к специалисту для безопасного объединения.';
    case 'invalid_code':
      return 'Неверный код.';
    case 'expired_code':
      return 'Срок кода истёк. Запросите новый код.';
    case 'too_many_attempts':
    case 'rate_limited':
      return 'Слишком много попыток. Повторите позже.';
    case 'expired_token':
    case 'revoked_token':
    case 'superseded_token':
    case 'already_linked':
    case 'inactive_relationship':
    case 'organization_unavailable': {
      const copy = terminalCopy(code);
      return `${copy.title}. ${copy.detail}`;
    }
    default:
      return 'Приглашение больше нельзя использовать. Попросите специалиста создать новую ссылку.';
  }
}

function terminalCopy(code: PatientInviteLifecycleCode | null): { title: string; detail: string } {
  switch (code) {
    case 'expired_token':
      return {
        title: 'Срок приглашения истёк',
        detail: 'Попросите специалиста создать новую ссылку.',
      };
    case 'revoked_token':
      return {
        title: 'Приглашение отозвано',
        detail: 'Если доступ всё ещё нужен, обратитесь к специалисту.',
      };
    case 'superseded_token':
      return {
        title: 'Создана новая ссылка',
        detail: 'Используйте последнее приглашение от специалиста.',
      };
    case 'already_linked':
      return { title: 'Кабинет уже подключён', detail: 'Войдите в существующий аккаунт пациента.' };
    case 'inactive_relationship':
    case 'organization_unavailable':
      return {
        title: 'Доступ временно недоступен',
        detail: 'Обратитесь к специалисту или администратору клиники.',
      };
    default:
      return {
        title: 'Ссылка недействительна',
        detail: 'Попросите специалиста создать новую ссылку.',
      };
  }
}

/**
 * Что стоит над приглашением. Ровно один из двух: логотип платформенного приложения (общий
 * пациентский вход) или логотип клиники (её брендированный хост, и только для ЕЁ приглашения).
 * Решение принимает серверный компонент — см. `page.tsx`.
 */
export type JoinBrand = { platformLockup?: boolean; clinicLogoUrl?: string };

function JoinBrandHeader({ brand, clinicTitle }: { brand: JoinBrand; clinicTitle: string | null }) {
  if (brand.platformLockup) {
    return (
      <div className="flex justify-center">
        <Image
          src="/brand/therapygo-lockup-horizontal.png"
          alt={PATIENT_DEFAULT_SURFACE.name}
          width={1086}
          height={362}
          sizes="220px"
          className="h-auto w-[13.75rem] max-w-full"
          priority
        />
      </div>
    );
  }
  if (!brand.clinicLogoUrl) return null;
  return (
    <div className="flex justify-center">
      {/* Логотип клиники приходит с медиа-хоста арендатора и меняется по её публикации:
          next/image потребовал бы заранее объявленного списка хостов. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.clinicLogoUrl}
        alt={clinicTitle ?? ''}
        className="h-14 w-auto max-w-[12rem] object-contain"
      />
    </div>
  );
}

export function JoinPatientClient({
  preview,
  failureCode,
  brand,
}: {
  preview: PatientInvitePublicPreview | null;
  failureCode: PatientInviteLifecycleCode | null;
  brand: JoinBrand;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!preview) {
    const copy = terminalCopy(failureCode);
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
        <div className="flex w-full flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-center">
            <JoinBrandHeader brand={brand} clinicTitle={null} />
            <h1 className="text-lg font-semibold text-foreground">{copy.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{copy.detail}</p>
          </div>
          <LegalFooterLinks />
        </div>
      </main>
    );
  }

  async function start() {
    setPending(true);
    setError(null);
    try {
      const { response, json } = await request('/api/join/email/start', { email });
      if (!response.ok || json.ok !== true) {
        setError(messageFor(json.error));
        return;
      }
      setStep('code');
    } catch {
      setError('Не удалось отправить код. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const { response, json } = await request('/api/join/email/confirm', { email, code });
      if (!response.ok || json.ok !== true || typeof json.redirectTo !== 'string') {
        setError(messageFor(json.error));
        return;
      }
      router.replace(json.redirectTo);
    } catch {
      setError('Не удалось подтвердить код. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-3 px-4 py-8">
      <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <JoinBrandHeader brand={brand} clinicTitle={preview.organizationTitle} />
        <div>
          <h1 className="text-lg font-semibold text-foreground">Доступ к кабинету пациента</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Приглашение от «{preview.organizationTitle}».
          </p>
          {preview.recipientHint ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Email для подтверждения: {preview.recipientHint}
            </p>
          ) : null}
        </div>
        {step === 'email' ? (
          <>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Email
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <Button type="button" disabled={pending || !email.trim()} onClick={() => void start()}>
              {pending ? 'Отправка…' : 'Получить код'}
            </Button>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm text-foreground">
              Код из письма
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="000000"
              />
            </label>
            <Button type="button" disabled={pending || !code.trim()} onClick={() => void confirm()}>
              {pending ? 'Проверка…' : 'Подтвердить и войти'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              Ввести email заново
            </Button>
          </>
        )}
        {error ? <p className="text-sm text-[var(--patient-color-danger)]">{error}</p> : null}
      </div>
      {/* Соглашение и политика обязаны быть на экране до входа: владелец 11.09 — «нам же всё равно
          надо показывать соглашение о пользовании». На брендированном хосте это ещё и единственное
          место, где названа платформа, — логотип там клиники. */}
      <LegalFooterLinks />
    </main>
  );
}
