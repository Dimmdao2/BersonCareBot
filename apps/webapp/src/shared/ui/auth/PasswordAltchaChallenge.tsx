'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import 'altcha';
import 'altcha/i18n/ru';
import type { AltchaWidgetElement } from 'altcha';

type ChallengeResponse = {
  ok?: boolean;
  challenge?: unknown;
};

type Props = {
  endpoint: string;
  email?: string;
  onVerified: (payload: string | null) => void;
};

export function PasswordAltchaChallenge({ endpoint, email, onVerified }: Props) {
  const widgetRef = useRef<AltchaWidgetElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const widget = widgetRef.current;
    if (!widget) return;

    const handleVerified = (event: Event) => {
      const detail = (event as CustomEvent<{ payload?: unknown }>).detail;
      onVerified(typeof detail?.payload === 'string' ? detail.payload : null);
    };
    widget.addEventListener('verified', handleVerified);
    onVerified(null);
    setError(null);

    void (async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(email ? { email } : {}),
        });
        const data = (await response.json().catch(() => null)) as ChallengeResponse | null;
        if (!response.ok || !data?.ok || !data.challenge) {
          throw new Error('challenge_unavailable');
        }
        if (!cancelled) {
          await widget.configure({
            challenge: data.challenge as Parameters<AltchaWidgetElement['configure']>[0]['challenge'],
            display: 'standard',
            language: 'ru',
            type: 'checkbox',
            humanInteractionSignature: false,
          });
          widget.reset();
        }
      } catch {
        if (!cancelled) setError('Проверка временно недоступна. Повторите попытку.');
      }
    })();

    return () => {
      cancelled = true;
      widget.removeEventListener('verified', handleVerified);
    };
  }, [email, endpoint, generation, onVerified]);

  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">Подтвердите, что вы человек</p>
      {createElement('altcha-widget', {
        ref: widgetRef,
        'aria-label': 'Проверка защиты от автоматических попыток',
      })}
      <p aria-live="polite" className="text-sm text-destructive">
        {error}
      </p>
      {error ? (
        <button
          type="button"
          className="w-fit text-sm font-medium underline underline-offset-2"
          onClick={() => setGeneration((current) => current + 1)}
        >
          Загрузить проверку ещё раз
        </button>
      ) : null}
    </div>
  );
}
