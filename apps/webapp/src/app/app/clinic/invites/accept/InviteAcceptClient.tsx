'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import {
  OtpCodeForm,
  type OtpConfirmResult,
  type OtpResendOutcome,
} from '@/shared/ui/patient/auth/OtpCodeForm';
import { patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import {
  inviteAcceptIssue,
  inviteAcceptIssueFromResponse,
  type InviteAcceptIssue,
} from './inviteAcceptState';

type InvitePreview = {
  invitedEmail: string;
  invitedRole: 'admin' | 'doctor';
  organizationTitle: string | null;
};

type StartOutcome =
  | { kind: 'ok' }
  | { kind: 'rate_limited'; retryAfterSeconds: number; issue: InviteAcceptIssue }
  | { kind: 'error'; issue: InviteAcceptIssue };

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => null);
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function retrySeconds(issue: InviteAcceptIssue): number {
  return Math.max(1, Math.ceil(issue.retryAfterSeconds ?? 60));
}

export function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
  const [pageIssue, setPageIssue] = useState<InviteAcceptIssue | null>(null);
  const [startIssue, setStartIssue] = useState<InviteAcceptIssue | null>(null);
  const [startRetryAfterSeconds, setStartRetryAfterSeconds] = useState(0);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (startRetryAfterSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setStartRetryAfterSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [startRetryAfterSeconds]);

  const lookup = useCallback(async () => {
    setPageIssue(null);
    setPreview(null);
    setChallengeId(null);
    setStartIssue(null);
    setStartRetryAfterSeconds(0);
    if (token.length < 16) {
      setPageIssue(inviteAcceptIssue('invalid_token', 'lookup'));
      return;
    }

    try {
      const response = await fetch('/api/clinic/invites/accept/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await readJson(response);
      if (!response.ok || json.ok !== true) {
        setPageIssue(inviteAcceptIssueFromResponse(response, json, 'lookup'));
        return;
      }
      if (
        typeof json.invited_email !== 'string' ||
        (json.invited_role !== 'admin' && json.invited_role !== 'doctor')
      ) {
        setPageIssue(inviteAcceptIssue('server_error', 'lookup'));
        return;
      }
      setPreview({
        invitedEmail: json.invited_email,
        invitedRole: json.invited_role,
        organizationTitle:
          typeof json.organizationTitle === 'string' ? json.organizationTitle : null,
      });
    } catch {
      setPageIssue(inviteAcceptIssue('network_error', 'lookup'));
    }
  }, [token]);

  useEffect(() => {
    void lookup();
  }, [lookup]);

  async function start(): Promise<StartOutcome> {
    setStarting(true);
    try {
      const response = await fetch('/api/clinic/invites/accept/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await readJson(response);
      if (!response.ok || json.ok !== true || typeof json.challengeId !== 'string') {
        const issue = inviteAcceptIssueFromResponse(response, json, 'start');
        if (issue.retryAfterSeconds != null) {
          return { kind: 'rate_limited', retryAfterSeconds: retrySeconds(issue), issue };
        }
        return { kind: 'error', issue };
      }
      setChallengeId(json.challengeId);
      setRetryAfterSeconds(
        typeof json.retryAfterSeconds === 'number' ? json.retryAfterSeconds : 60,
      );
      return { kind: 'ok' };
    } catch {
      return { kind: 'error', issue: inviteAcceptIssue('network_error', 'start') };
    } finally {
      setStarting(false);
    }
  }

  function applyStartOutcome(outcome: StartOutcome): OtpResendOutcome {
    if (outcome.kind === 'ok') {
      setStartIssue(null);
      setStartRetryAfterSeconds(0);
      return { kind: 'ok' };
    }
    if (outcome.issue.terminal) {
      setPageIssue(outcome.issue);
    } else {
      setStartIssue(outcome.issue);
    }
    if (outcome.kind === 'rate_limited') {
      setStartRetryAfterSeconds(outcome.retryAfterSeconds);
      return { kind: 'rate_limited', retryAfterSeconds: outcome.retryAfterSeconds };
    }
    return { kind: 'error', message: outcome.issue.message };
  }

  async function confirm(code: string): Promise<OtpConfirmResult> {
    try {
      const response = await fetch('/api/clinic/invites/accept/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, code }),
      });
      const json = await readJson(response);
      if (response.ok && json.ok === true && typeof json.redirectTo === 'string') {
        router.replace(json.redirectTo);
        return { ok: true };
      }
      const issue = inviteAcceptIssueFromResponse(response, json, 'confirm');
      if (issue.terminal) {
        setPageIssue(issue);
      }
      return {
        ok: false,
        code: typeof json.error === 'string' ? json.error : 'server_error',
        message: issue.message,
        retryAfterSeconds: issue.retryAfterSeconds,
      };
    } catch {
      const issue = inviteAcceptIssue('network_error', 'confirm');
      return { ok: false, code: 'server_error', message: issue.message };
    }
  }

  if (pageIssue) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
        <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
          <h1 className="text-base font-semibold text-foreground">{pageIssue.title}</h1>
          <p className={patientMutedTextClass}>{pageIssue.message}</p>
          {!pageIssue.terminal ? (
            <Button type="button" variant="outline" onClick={() => void lookup()}>
              Повторить
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => router.replace('/app')}>
            Ко входу
          </Button>
        </div>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 text-sm text-muted-foreground">
        Проверяем приглашение…
      </main>
    );
  }

  const roleLabel = preview.invitedRole === 'doctor' ? 'врачом' : 'администратором';
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
      <div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-base font-semibold text-foreground">Приглашение в команду</h1>
          <p className={patientMutedTextClass}>
            {preview.organizationTitle
              ? `${preview.organizationTitle} приглашает вас ${roleLabel}.`
              : `Вас приглашают ${roleLabel}.`}
          </p>
          <p className={patientMutedTextClass}>
            Подтвердите email {preview.invitedEmail} одноразовым кодом.
          </p>
        </div>
        {!challengeId ? (
          <>
            {startIssue ? (
              <p className="text-sm text-[var(--patient-color-danger)]">{startIssue.message}</p>
            ) : null}
            <Button
              type="button"
              onClick={async () => {
                applyStartOutcome(await start());
              }}
              disabled={starting || startRetryAfterSeconds > 0}
            >
              {starting
                ? 'Отправка…'
                : startRetryAfterSeconds > 0
                  ? `Повторить через ${startRetryAfterSeconds} сек`
                  : startIssue
                    ? 'Отправить код повторно'
                    : 'Получить код'}
            </Button>
          </>
        ) : (
          <OtpCodeForm
            challengeId={challengeId}
            retryAfterSeconds={retryAfterSeconds}
            description="Введите код из письма. Если срок кода истёк, запросите новый после окончания таймера."
            submitLabel="Принять приглашение"
            onConfirm={confirm}
            onResend={async () => applyStartOutcome(await start())}
            onBack={() => {
              setChallengeId(null);
              setStartIssue(null);
              setStartRetryAfterSeconds(0);
            }}
          />
        )}
      </div>
    </main>
  );
}
