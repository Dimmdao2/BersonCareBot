'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
      return 'Этот адрес не соответствует приглашению. Попросите специалиста исправить адрес и создать новую ссылку.';
    case 'conflicting_identity':
      return 'Этот адрес уже связан с другой учётной записью. Обратитесь к специалисту для безопасного объединения.';
    case 'invalid_code':
      return 'Неверный код.';
    case 'expired_code':
      return 'Срок кода истёк. Запросите новый код.';
    case 'too_many_attempts':
    case 'rate_limited':
      return 'Слишком много попыток. Повторите позже.';
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

export function JoinPatientClient({
  preview,
  failureCode,
}: {
  preview: PatientInvitePublicPreview | null;
  failureCode: PatientInviteLifecycleCode | null;
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
        <div className="w-full rounded-xl border border-border bg-card p-5 text-center">
          <h1 className="text-lg font-semibold text-foreground">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.detail}</p>
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
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-5">
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
    </main>
  );
}
