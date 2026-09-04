'use client';

import { useState } from 'react';
import { Copy, Link2Off } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import type { PatientPortalStatus } from '@/modules/patient-invites/ports';

type PortalState = {
  status: PatientPortalStatus;
  inviteId: string | null;
  expiresAt: string | null;
};

type IssueResponse = {
  ok?: unknown;
  error?: unknown;
  inviteId?: unknown;
  expiresAt?: unknown;
  relativeUrl?: unknown;
};

const labels: Record<PatientPortalStatus, string> = {
  not_activated: 'Кабинет не активирован',
  invited: 'Приглашение создано',
  linked: 'Кабинет подключён',
};

export function PatientPortalInviteControls({
  patientUserId,
  initialState,
}: {
  patientUserId: string;
  initialState: PortalState;
}) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  async function issueAndCopy() {
    setPending(true);
    try {
      const response = await fetch(`/api/doctor/patients/${patientUserId}/portal-invite`, {
        method: 'POST',
      });
      const json = (await response.json().catch(() => null)) as IssueResponse | null;
      if (
        !response.ok ||
        json?.ok !== true ||
        typeof json.inviteId !== 'string' ||
        typeof json.expiresAt !== 'string' ||
        typeof json.relativeUrl !== 'string'
      ) {
        toast.error('Не удалось создать приглашение');
        return;
      }
      const absoluteUrl = `${window.location.origin}${json.relativeUrl}`;
      setState({ status: 'invited', inviteId: json.inviteId, expiresAt: json.expiresAt });
      setGeneratedUrl(absoluteUrl);
      try {
        await navigator.clipboard.writeText(absoluteUrl);
        toast.success('Ссылка скопирована');
      } catch {
        toast.error('Ссылка создана, но не скопирована');
      }
    } catch {
      toast.error('Не удалось создать приглашение');
    } finally {
      setPending(false);
    }
  }

  async function revoke() {
    if (!state.inviteId) return;
    setPending(true);
    try {
      const response = await fetch(`/api/doctor/patients/${patientUserId}/portal-invite`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteId: state.inviteId }),
      });
      if (!response.ok) {
        toast.error('Не удалось отозвать приглашение.');
        return;
      }
      setState({ status: 'not_activated', inviteId: null, expiresAt: null });
      setGeneratedUrl(null);
      toast.success('Приглашение отозвано.');
    } catch {
      toast.error('Не удалось отозвать приглашение.');
    } finally {
      setPending(false);
    }
  }

  if (state.status === 'linked') return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-xs text-foreground">
        <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
        {labels[state.status]}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => void issueAndCopy()}
        className="h-7 gap-1 px-2.5 text-xs"
      >
        <Copy className="h-3.5 w-3.5" />
        Пригласить
      </Button>
      {state.status === 'invited' ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => void revoke()}
          className="h-7 px-2.5 text-xs text-muted-foreground"
        >
          Отозвать
        </Button>
      ) : null}
      {generatedUrl ? (
        <Input
          readOnly
          aria-label="Ссылка приглашения"
          value={generatedUrl}
          onFocus={(event) => event.currentTarget.select()}
          className="basis-full text-xs"
        />
      ) : null}
    </div>
  );
}
