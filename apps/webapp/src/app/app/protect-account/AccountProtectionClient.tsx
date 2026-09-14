'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { STAFF_SURFACE } from '@/config/productSurfaces';

type State = 'ready' | 'busy' | 'done' | 'used' | 'expired' | 'invalid' | 'failed';

export default function AccountProtectionClient({ actionKey }: { actionKey: string }) {
  const [state, setState] = useState<State>(actionKey ? 'ready' : 'invalid');

  async function protectAccount() {
    setState('busy');
    try {
      const response = await fetch('/api/public/account-protection', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: actionKey }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        reason?: 'used' | 'expired' | 'invalid' | 'failed';
      } | null;
      if (result?.ok) {
        setState('done');
      } else {
        setState(result?.reason ?? 'failed');
      }
    } catch {
      setState('failed');
    }
  }

  const message =
    state === 'done'
      ? 'Вход на всех устройствах завершён. Войдите снова и выберите новый пароль.'
      : state === 'used'
        ? 'Эта кнопка уже была использована.'
        : state === 'expired'
          ? 'Срок действия этой кнопки истёк.'
          : state === 'invalid'
            ? 'Эта кнопка больше не действует.'
            : state === 'failed'
              ? 'Не удалось выполнить действие. Попробуйте ещё раз.'
              : 'Если входили не вы, завершите вход на всех устройствах. При следующем входе потребуется выбрать новый пароль.';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <section className="mx-auto flex max-w-lg flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-blue-800">{STAFF_SURFACE.name}</p>
          <h1 className="mt-1 text-2xl font-bold">Защитить учётную запись</h1>
        </div>
        <p className="text-sm leading-6 text-slate-700">{message}</p>
        {state === 'ready' || state === 'busy' || state === 'failed' ? (
          <Button type="button" disabled={state === 'busy'} onClick={protectAccount}>
            {state === 'busy' ? 'Завершаем…' : 'Закрыть сеансы + смена пароля'}
          </Button>
        ) : null}
        {state === 'done' || state === 'used' || state === 'expired' || state === 'invalid' ? (
          <Link className="text-sm font-medium text-blue-800 underline" href="/app">
            Перейти ко входу
          </Link>
        ) : null}
      </section>
    </main>
  );
}
