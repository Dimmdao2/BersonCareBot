'use client';

import { useState } from 'react';
import { Copy, Link2Off, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
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
  qrDataUri?: unknown;
};

/** Ссылка и её QR-код всегда приходят парой от сервера и живут в состоянии тоже парой. */
type InviteLink = { url: string; qrDataUri: string };

const labels: Record<PatientPortalStatus, string> = {
  not_activated: 'Кабинет не активирован',
  invited: 'Приглашение создано',
  linked: 'Кабинет подключён',
};

export function PatientPortalInviteControls({
  patientUserId,
  patientName,
  initialState,
}: {
  patientUserId: string;
  /** Фамилия и имя пациента — заголовок модалки с QR-кодом (владелец 10.09). */
  patientName: string;
  initialState: PortalState;
}) {
  const [state, setState] = useState(initialState);
  const [pending, setPending] = useState(false);
  const [link, setLink] = useState<InviteLink | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
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
        typeof json.url !== 'string' ||
        typeof json.qrDataUri !== 'string'
      ) {
        toast.error('Не удалось создать приглашение');
        return;
      }
      // Абсолютную ссылку собирает сервер: у клиники со своим доменом она обязана вести на её
      // домен, а не на тот хост, где сейчас стоит специалист.
      const reused = state.inviteId === json.inviteId;
      setState({ status: 'invited', inviteId: json.inviteId, expiresAt: json.expiresAt });
      setLink({ url: json.url, qrDataUri: json.qrDataUri });
      setCopyStatus('idle');
      // Живое приглашение сервер возвращает как есть — специалисту важно понимать, что человеку
      // уже отправленная ссылка от нажатия не погасла.
      toast.success(reused ? 'Ссылка приглашения ещё действует' : 'Ссылка приглашения создана');
    } catch {
      toast.error('Не удалось создать приглашение');
    } finally {
      setPending(false);
    }
  }

  /**
   * Владелец 10.09: «пусть остаётся „Пригласить“… если эта ссылка уже создана, её не надо
   * переделывать, надо просто её снова показать; когда истечёт — тогда создаётся новая». Решает
   * это сервер: живое приглашение он возвращает как есть, истёкшее заменяет новым.
   */

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
      setLink(null);
      setQrOpen(false);
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
        onClick={() => void issue()}
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
      {link ? (
        <>
          <Input
            readOnly
            aria-label="Ссылка приглашения"
            value={link.url}
            onFocus={(event) => event.currentTarget.select()}
            className="basis-full text-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => copyGeneratedUrl(link.url)}
          >
            {copyStatus === 'copied' ? 'Скопировано' : 'Скопировать'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2.5 text-xs"
            onClick={() => setQrOpen(true)}
          >
            <QrCode className="h-3.5 w-3.5" />
            Показать QR-код
          </Button>
          {copyStatus === 'failed' ? (
            <p role="alert" className="w-full text-xs text-destructive">
              Не удалось скопировать ссылку, скопируйте вручную из поля выше.
            </p>
          ) : null}
          {/*
           * Модалка нужна ровно для одного: человек напротив наводит на экран телефон. Поэтому в
           * ней только код — крупно и по центру, — а сама ссылка в ней НЕ печатается (владелец
           * 10.09: «наверху заголовок модалки слева приглашение, справа фамилия имя пациента без
           * ссылки просто чёрным шрифтом»).
           */}
          <Dialog open={qrOpen} onOpenChange={setQrOpen}>
            <DialogContent className="bg-white sm:max-w-md">
              <DialogHeader>
                <div className="flex items-baseline justify-between gap-3 pr-8">
                  <DialogTitle className="text-black">Приглашение</DialogTitle>
                  <span className="truncate text-sm font-medium text-black">{patientName}</span>
                </div>
                <DialogDescription className="sr-only">
                  Наведите камеру телефона на код, чтобы открыть кабинет пациента.
                </DialogDescription>
              </DialogHeader>
              {/*
               * `<img>`, а не вставка разметки: картинка из `data:`-ссылки не исполняет скриптов и
               * не попадает в DOM страницы, поэтому `dangerouslySetInnerHTML` здесь не нужен.
               */}
              {/* eslint-disable-next-line @next/next/no-img-element -- оптимизировать нечего: это
                  полтора килобайта векторной разметки в `data:`-ссылке, `next/image` их не грузит */}
              <img
                src={link.qrDataUri}
                alt="QR-код приглашения"
                className="mx-auto block h-auto w-full max-w-[22rem] bg-white"
              />
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
