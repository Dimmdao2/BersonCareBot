'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/patient/primitives/button';
import { cn } from '@/lib/utils';
import {
  FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY,
  type AuthChannelUiPolicy,
} from '@/modules/auth/otpChannelUi';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { markFreshLoginAfterAuth } from '@/shared/lib/webPush/freshLoginStorage';
import { finishChannelLinkNavigation } from '@/shared/lib/telegramChannelLinkOpen';
import { getBrowserCalendarIanaForAuth } from '@/shared/lib/browserCalendarIana';
import { InternationalPhoneInput } from '@/shared/ui/patient/auth/InternationalPhoneInput';
import { AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS } from '@/shared/ui/patient/auth/loginChrome';
import {
  patientCaptionTextClass,
  patientInlineLinkClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';
import { notificationText } from '@/shared/notifications/notificationText';
import { AccountMergeConfirmation } from './AccountMergeConfirmation';
import type { HumanMergePrompt } from '@bersoncare/platform-merge';

const POLL_MS = 2500;

export type PhoneMessengerAuthFlowProps = {
  channelPolicy?: AuthChannelUiPolicy;
  purpose: 'login' | 'profile_bind';
  onBack: () => void;
  supportContactHref?: string;
  /** Для login: безопасный next из URL `/app`. */
  nextParam?: string | null;
  /** После успешного подтверждения в профиле (без полного redirect login). */
  onProfileComplete?: () => void;
  /** Login-only: parent opens the shared staff-factor form backed by the signed continuation. */
  onStaffFactorRequired?: () => void;
  title?: string;
  /** Скрыть «Назад» на шаге ввода номера (bind-phone из профиля — назад только в AppShell). */
  hideBackOnPhoneStep?: boolean;
};

type FlowStep = 'phone' | 'messenger_pick' | 'waiting' | 'merge';

export function PhoneMessengerAuthFlow({
  channelPolicy = FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY,
  purpose,
  onBack,
  nextParam = null,
  onProfileComplete,
  onStaffFactorRequired,
  title = 'Вход по номеру',
  hideBackOnPhoneStep = false,
}: PhoneMessengerAuthFlowProps) {
  const hasAnyMessenger = channelPolicy.telegram || channelPolicy.max;
  const canStartForPurpose = hasAnyMessenger;
  const [step, setStep] = useState<FlowStep>('phone');
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [bindChannel, setBindChannel] = useState<'telegram' | 'max' | null>(null);
  const [bindManualCommand, setBindManualCommand] = useState<string | null>(null);
  const [mergePrompt, setMergePrompt] = useState<HumanMergePrompt | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const resetBindAttempt = useCallback(() => {
    clearPoll();
    setSetupToken(null);
    setBindChannel(null);
    setBindManualCommand(null);
    setStep('messenger_pick');
  }, [clearPoll]);

  const redirectOk = useCallback(
    (redirectTo: string, role?: 'client' | 'doctor' | 'admin') => {
      markFreshLoginAfterAuth();
      const target = getPostAuthRedirectTarget(role ?? 'client', nextParam, redirectTo);
      window.location.assign(target);
    },
    [nextParam],
  );

  const finishMessengerBind = useCallback(
    async (token: string) => {
      clearPoll();
      setLoading(true);
      try {
        const finishRes = await fetch('/api/auth/phone/messenger-bind/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            setupToken: token,
            browserCalendarIana: getBrowserCalendarIanaForAuth(),
          }),
        });
        const finishData = (await finishRes.json().catch(() => ({}))) as {
          ok?: boolean;
          mergeRequired?: boolean;
          prompt?: HumanMergePrompt;
          factorRequired?: boolean;
          redirectTo?: string;
          role?: 'client' | 'doctor' | 'admin';
          message?: string;
        };
        if (finishData.ok && finishData.mergeRequired && finishData.prompt) {
          setMergePrompt(finishData.prompt);
          setStep('merge');
          return;
        }
        if (finishData.ok && finishData.factorRequired && purpose === 'login') {
          onStaffFactorRequired?.();
          return;
        }
        if (finishRes.ok && finishData.ok) {
          if (purpose === 'profile_bind') {
            onProfileComplete?.();
          } else if (finishData.redirectTo) {
            redirectOk(finishData.redirectTo, finishData.role);
          }
          return;
        }
        toast.error(finishData.message ?? notificationText.authConfirmationFailed);
        resetBindAttempt();
      } catch {
        toast.error(notificationText.authConfirmationFailed);
        resetBindAttempt();
      } finally {
        setLoading(false);
      }
    },
    [clearPoll, onProfileComplete, onStaffFactorRequired, purpose, redirectOk, resetBindAttempt],
  );

  const pollBindStatus = useCallback(
    async (token: string) => {
      const statusRes = await fetch('/api/auth/phone/messenger-bind/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: token }),
      });
      const statusData = (await statusRes.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        challengeId?: string;
        error?: string;
      };
      if (!statusRes.ok || !statusData.ok) return;
      if (statusData.status === 'consumed') {
        await finishMessengerBind(token);
        return;
      }
      if (statusData.status === 'otp_ready' && statusData.challengeId) {
        await finishMessengerBind(token);
        return;
      }
      if (statusData.status === 'failed') {
        clearPoll();
        toast.error(notificationText.messagingPhoneVerifyFailed);
        resetBindAttempt();
      }
      if (statusData.status === 'expired') {
        clearPoll();
        toast.error(notificationText.authBindingExpired);
        resetBindAttempt();
      }
    },
    [clearPoll, finishMessengerBind, resetBindAttempt],
  );

  useEffect(() => () => clearPoll(), [clearPoll]);

  useEffect(() => {
    if (step !== 'waiting' || !setupToken || !bindChannel) return;
    const onResume = () => {
      if (document.visibilityState === 'visible') {
        void pollBindStatus(setupToken);
      }
    };
    document.addEventListener('visibilitychange', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [step, setupToken, bindChannel, pollBindStatus]);

  if (step === 'merge' && mergePrompt && setupToken) {
    return (
      <AccountMergeConfirmation
        key={JSON.stringify(mergePrompt)}
        prompt={mergePrompt}
        busy={loading}
        onReject={() => {
          setMergePrompt(null);
          resetBindAttempt();
        }}
        onConfirm={async (mergeDecision) => {
          setLoading(true);
          try {
            const res = await fetch('/api/auth/phone/messenger-bind/finish', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                setupToken,
                browserCalendarIana: getBrowserCalendarIanaForAuth(),
                mergeDecision,
              }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              mergeRequired?: boolean;
              prompt?: HumanMergePrompt;
              redirectTo?: string;
              role?: 'client' | 'doctor' | 'admin';
              factorRequired?: boolean;
              message?: string;
            };
            if (data.ok && data.mergeRequired && data.prompt) {
              setMergePrompt(data.prompt);
              return;
            }
            if (!res.ok || !data.ok) {
              toast.error(data.message ?? notificationText.authConfirmationFailed);
              return;
            }
            clearPoll();
            if (data.factorRequired && purpose === 'login') onStaffFactorRequired?.();
            else if (purpose === 'profile_bind') onProfileComplete?.();
            else if (data.redirectTo) redirectOk(data.redirectTo, data.role);
          } catch {
            toast.error(notificationText.authConfirmationFailed);
          } finally {
            setLoading(false);
          }
        }}
      />
    );
  }

  const runCheckPhone = async (normalized: string) => {
    // Login and profile binding share the same contact-proof path. Never inspect the entered phone
    // to select a delivery channel or call the legacy direct OTP route automatically.
    setPhone(normalized);
    setStep('messenger_pick');
  };

  const startMessengerBind = async (channelCode: 'telegram' | 'max') => {
    if (!phone || !channelPolicy[channelCode]) return;
    setLoading(true);
    clearPoll();
    try {
      const res = await fetch('/api/auth/phone/messenger-bind/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, channelCode, purpose }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        setupToken?: string;
        url?: string;
        manualCommand?: string;
        message?: string;
        error?: string;
        retryAfterSeconds?: number;
      };
      if (res.status === 429 || data.error === 'rate_limited') {
        toast.error(
          data.message ??
            (data.retryAfterSeconds != null
              ? `Повторите через ${Math.ceil(data.retryAfterSeconds / 60)} мин.`
              : notificationText.authTooManyAttempts),
        );
        return;
      }
      if (!res.ok || !data.ok || !data.setupToken || !data.url) {
        toast.error(data.message ?? notificationText.messagingBindingStartFailed);
        return;
      }
      const bindToken = data.setupToken;
      setSetupToken(bindToken);
      setBindChannel(channelCode);
      setBindManualCommand(data.manualCommand ?? null);
      finishChannelLinkNavigation({
        blankWin: null,
        url: data.url,
        channel: channelCode,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      if (channelCode === 'max' && data.manualCommand) {
        try {
          await navigator.clipboard.writeText(data.manualCommand);
          toast.success(notificationText.messagingBotCommandCopied);
        } catch {
          toast('Скопируйте команду вручную в чат с ботом в Max');
        }
      }
      setStep('waiting');

      void pollBindStatus(bindToken);
      pollRef.current = setInterval(() => {
        void pollBindStatus(bindToken);
      }, POLL_MS);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'phone') {
    if (!canStartForPurpose) {
      return (
        <div className="flex w-full flex-col gap-3 text-left">
          {!hideBackOnPhoneStep ? (
            <Button
              type="button"
              variant="link"
              className={patientInlineLinkClass}
              onClick={onBack}
            >
              Назад
            </Button>
          ) : null}
          <p className={patientMutedTextClass}>Вход и привязка по номеру сейчас недоступны.</p>
        </div>
      );
    }
    return (
      <div id="phone-messenger-auth-phone" className="flex w-full flex-col gap-3 text-left">
        {!hideBackOnPhoneStep ? (
          <Button
            type="button"
            variant="link"
            className={patientInlineLinkClass}
            disabled={loading}
            onClick={onBack}
          >
            Назад
          </Button>
        ) : null}
        <h2 className={cn(patientSectionTitleClass, 'text-center')}>{title}</h2>
        <InternationalPhoneInput
          disabled={loading}
          onSubmit={runCheckPhone}
          submitLabel="Продолжить"
        />
      </div>
    );
  }

  if (step === 'messenger_pick') {
    return (
      <div id="phone-messenger-auth-pick" className="flex w-full flex-col gap-3 text-left">
        <Button
          type="button"
          variant="link"
          className={patientInlineLinkClass}
          disabled={loading}
          onClick={() => {
            clearPoll();
            setStep('phone');
          }}
        >
          Назад
        </Button>
        <p className={patientMutedTextClass}>
          Для {purpose === 'login' ? 'входа' : 'привязки'} по номеру телефона выберите удобный
          мессенджер
        </p>
        <div className="flex flex-col gap-2">
          {channelPolicy.telegram ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startMessengerBind('telegram')}
            >
              Telegram
            </Button>
          ) : null}
          {channelPolicy.max ? (
            <Button
              type="button"
              variant="outline"
              className={AUTH_LOGIN_FORM_PRIMARY_BUTTON_CLASS}
              disabled={loading}
              onClick={() => void startMessengerBind('max')}
            >
              Max
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    const waitingDescription = `Подтвердите номер в ${bindChannel === 'max' ? 'Max' : 'Telegram'}. После этого можно вернуться в приложение.`;
    return (
      <div id="phone-messenger-auth-code" className="flex w-full flex-col gap-3 text-left">
        {purpose === 'login' ? (
          <Button
            type="button"
            variant="link"
            className={patientInlineLinkClass}
            disabled={loading}
            onClick={() => {
              clearPoll();
              onBack();
            }}
          >
            Войти иначе
          </Button>
        ) : null}
        <p className={patientMutedTextClass}>{waitingDescription}</p>
        {bindManualCommand ? (
          <p className={patientCaptionTextClass}>
            Если бот открылся без запроса контакта, отправьте команду:{' '}
            <span className="font-mono patient-text-primary">{bindManualCommand}</span>
          </p>
        ) : null}
        <p className={cn(patientMutedTextClass, 'text-center')}>
          Ожидание подтверждения в мессенджере…
        </p>
        <Button
          type="button"
          variant="link"
          className={patientInlineLinkClass}
          onClick={resetBindAttempt}
        >
          Начать снова
        </Button>
      </div>
    );
  }

  return null;
}
