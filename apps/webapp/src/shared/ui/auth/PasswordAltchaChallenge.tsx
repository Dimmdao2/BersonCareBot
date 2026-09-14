'use client';

import { createElement, useEffect, useRef, useState } from 'react';
import type { AltchaWidgetElement } from 'altcha';
import { notificationText } from '@/shared/notifications/notificationText';

type ChallengeResponse =
  | { ok: true; provider: 'altcha'; challenge: unknown; expiresAt: string }
  | { ok: true; provider: 'yandex'; clientKey: string };

type Props = {
  endpoint: string;
  email?: string;
  onVerified: (payload: string | null) => void;
};

type SmartCaptchaApi = {
  render(
    container: HTMLElement,
    options: { sitekey: string; hl: 'ru'; callback: (token: string) => void },
  ): number;
  subscribe(
    widgetId: number,
    event: 'network-error' | 'token-expired',
    callback: () => void,
  ): () => void;
  destroy?(widgetId: number): void;
};

let smartCaptchaScriptPromise: Promise<void> | null = null;
let altchaWidgetModulePromise: Promise<void> | null = null;

/**
 * В страницу подгружается ТОЛЬКО выбранный поставщик (требование владельца 14.09). Яндекс тянется
 * своим скриптом ниже; наш ALTCHA — вот этим импортом, и тоже лишь тогда, когда сервер ответил, что
 * проверка идёт через него. Статический `import 'altcha'` наверху файла клал бы виджет и его русский
 * словарь в бандл каждому, кто открыл вход, — даже когда выбран Яндекс и ALTCHA никогда не покажется.
 */
function loadAltchaWidgetModule(): Promise<void> {
  altchaWidgetModulePromise ??= (async () => {
    await import('altcha');
    await import('altcha/i18n/ru');
  })().catch((error: unknown) => {
    altchaWidgetModulePromise = null;
    throw error;
  });
  return altchaWidgetModulePromise;
}

function smartCaptchaApi(): SmartCaptchaApi | undefined {
  return (window as Window & { smartCaptcha?: SmartCaptchaApi }).smartCaptcha;
}

function loadSmartCaptchaScript(): Promise<void> {
  if (smartCaptchaApi()) return Promise.resolve();
  if (smartCaptchaScriptPromise) return smartCaptchaScriptPromise;
  smartCaptchaScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://smartcaptcha.cloud.yandex.ru/captcha.js"]',
    );
    const script = existing ?? document.createElement('script');
    const handleLoad = () => (smartCaptchaApi() ? resolve() : reject(new Error('captcha_missing')));
    const handleError = () => reject(new Error('captcha_load_failed'));
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    if (!existing) {
      script.src = 'https://smartcaptcha.cloud.yandex.ru/captcha.js';
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    smartCaptchaScriptPromise = null;
    throw error;
  });
  return smartCaptchaScriptPromise;
}

export function PasswordAltchaChallenge({ endpoint, email, onVerified }: Props) {
  const altchaRef = useRef<AltchaWidgetElement | null>(null);
  const yandexRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    onVerified(null);
    setError(null);
    setChallenge(null);
    void (async () => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(email ? { email } : {}),
        });
        const data = (await response.json().catch(() => null)) as ChallengeResponse | null;
        if (!response.ok || !data?.ok) throw new Error('challenge_unavailable');
        if (!cancelled) setChallenge(data);
      } catch {
        if (!cancelled) setError(notificationText.authCaptchaUnavailable);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email, endpoint, generation, onVerified]);

  useEffect(() => {
    if (challenge?.provider !== 'altcha') return;
    const widget = altchaRef.current;
    if (!widget) return;
    let cancelled = false;
    const handleVerified = (event: Event) => {
      const detail = (event as CustomEvent<{ payload?: unknown }>).detail;
      onVerified(typeof detail?.payload === 'string' ? detail.payload : null);
    };
    widget.addEventListener('verified', handleVerified);
    // Настраивать виджет можно только после того, как модуль определил `altcha-widget`: до этого
    // в разметке стоит ещё не «поднятый» браузером элемент без метода `configure`.
    void loadAltchaWidgetModule()
      .then(() => {
        if (cancelled) return;
        return widget
          .configure({
            challenge: challenge.challenge as Parameters<
              AltchaWidgetElement['configure']
            >[0]['challenge'],
            display: 'standard',
            language: 'ru',
            type: 'checkbox',
            humanInteractionSignature: false,
          })
          .then(() => widget.reset());
      })
      .catch(() => {
        if (!cancelled) setError(notificationText.authCaptchaUnavailable);
      });
    return () => {
      cancelled = true;
      widget.removeEventListener('verified', handleVerified);
    };
  }, [challenge, onVerified]);

  useEffect(() => {
    if (challenge?.provider !== 'yandex') return;
    const container = yandexRef.current;
    if (!container) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    void loadSmartCaptchaScript()
      .then(() => {
        const api = smartCaptchaApi();
        if (cancelled || !api) return;
        const widgetId = api.render(container, {
          sitekey: challenge.clientKey,
          hl: 'ru',
          callback: (token) => onVerified(token),
        });
        const unsubscribeExpired = api.subscribe(widgetId, 'token-expired', () => onVerified(null));
        const unsubscribeNetwork = api.subscribe(widgetId, 'network-error', () => onVerified(null));
        cleanup = () => {
          unsubscribeExpired();
          unsubscribeNetwork();
          api.destroy?.(widgetId);
        };
      })
      .catch(() => {
        if (!cancelled) setError(notificationText.authCaptchaUnavailable);
      });
    return () => {
      cancelled = true;
      cleanup?.();
      container.replaceChildren();
    };
  }, [challenge, onVerified]);

  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">Подтвердите, что вы человек</p>
      {challenge?.provider === 'altcha'
        ? createElement('altcha-widget', {
            ref: altchaRef,
            'aria-label': 'Проверка защиты от автоматических попыток',
          })
        : null}
      {challenge?.provider === 'yandex' ? <div ref={yandexRef} className="h-[100px]" /> : null}
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
