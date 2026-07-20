'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function JoinStartClient() {
  const router = useRouter();
  const [failureCode, setFailureCode] = useState<string | null>(null);

  useEffect(() => {
    const bearer = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    window.history.replaceState(null, '', '/join/start');
    if (bearer.length < 32) {
      queueMicrotask(() => setFailureCode('invalid_token'));
      return;
    }
    void fetch('/api/join/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bearer }),
      cache: 'no-store',
    })
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as {
          ok?: unknown;
          error?: unknown;
          redirectTo?: unknown;
        } | null;
        if (!response.ok || json?.ok !== true || typeof json.redirectTo !== 'string') {
          setFailureCode(typeof json?.error === 'string' ? json.error : 'invalid_token');
          return;
        }
        router.replace(json.redirectTo);
      })
      .catch(() => setFailureCode('invalid_token'));
  }, [router]);

  const failed = failureCode != null;
  const title =
    failureCode === 'expired_token'
      ? 'Срок приглашения истёк'
      : failureCode === 'revoked_token'
        ? 'Приглашение отозвано'
        : failureCode === 'superseded_token'
          ? 'Создана новая ссылка'
          : failureCode === 'exchanged_token'
            ? 'Ссылка уже была открыта'
            : failureCode === 'already_linked'
              ? 'Кабинет уже подключён'
              : 'Ссылка недействительна';

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="w-full rounded-xl border border-border bg-card p-5 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {failed ? title : 'Проверяем приглашение…'}
        </h1>
        {failed ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {failureCode === 'exchanged_token'
              ? 'Продолжите в уже открытом окне или попросите специалиста создать новую ссылку.'
              : failureCode === 'already_linked'
                ? 'Войдите в существующий аккаунт пациента.'
                : 'Попросите специалиста создать новую ссылку.'}
          </p>
        ) : null}
      </div>
    </main>
  );
}
