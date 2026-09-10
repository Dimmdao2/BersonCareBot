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
  url?: unknown;
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
  // PPI-01: clipboard permission is separate from invite creation — a denied/unavailable
  // clipboard must not read as invite failure. Mirrors the copy-button pattern in
  // ClinicBookingLinkSection (explicit fallback control, no error toast on copy failure).
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  /**
   * Копирование живёт ОТДЕЛЬНО от выпуска и вызывается прямо в обработчике нажатия. Раньше оно
   * стояло после `await fetch`, и Safari на телефоне к этому моменту уже не считал вызов жестом
   * пользователя — отсюда «Не удалось скопировать ссылку» при исправной ссылке (владелец 10.09).
   */
  function copyGeneratedUrl(url: string) {
    try {
      const written = navigator.clipboard?.writeText(url);
      if (!written) {
        setCopyStatus('failed');
        return;
      }
      void written.then(
        () => setCopyStatus('copied'),
        () => setCopyStatus('failed'),
      );
    } catch {
      setCopyStatus('failed');
    }
  }

  async function issue() {
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
        typeof json.url !== 'string'
      ) {
        toast.error('Не удалось создать приглашение');
        return;
      }
      // Абсолютную ссылку собирает сервер: у клиники со своим доменом она обязана вести на её
      // домен, а не на тот хост, где сейчас стоит специалист.
      setState({ status: 'invited', inviteId: json.inviteId, expiresAt: json.expiresAt });
      setGeneratedUrl(json.url);
      setCopyStatus('idle');
      toast.success('Ссылка приглашения создана');
    } catch {
      toast.error('Не удалось создать приглашение');
    } finally {
      setPending(false);
    }
  }

  /**
   * Повторное нажатие НЕ выпускает вторую ссылку молча. В базе лежит только хеш токена, поэтому
   * показать выданную ранее ссылку невозможно в принципе — а новый выпуск гасит прежнюю
   * (`createReplacingPending`). То есть молчаливый перевыпуск отзывал ссылку, которую специалист
   * уже кому-то отправил (владелец 10.09: «каждый раз новое создаётся, зачем это надо?»).
   */
  function requestNewLink() {
    if (
      generatedUrl !== null &&
      !window.confirm('Прежняя ссылка перестанет работать. Выпустить новую?')
    ) {
      return;
    }
    void issue();
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
        onClick={requestNewLink}
        className="h-7 gap-1 px-2.5 text-xs"
      >
        <Copy className="h-3.5 w-3.5" />
        {generatedUrl ? 'Выпустить новую ссылку' : 'Пригласить'}
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
        <>
          <Input
            readOnly
            aria-label="Ссылка приглашения"
            value={generatedUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="basis-full text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => copyGeneratedUrl(generatedUrl)}
          >
            {copyStatus === 'copied' ? 'Скопировано' : 'Скопировать'}
          </Button>
          {copyStatus === 'failed' ? (
            <p role="alert" className="w-full text-xs text-destructive">
              Не удалось скопировать ссылку, скопируйте вручную из поля выше.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
