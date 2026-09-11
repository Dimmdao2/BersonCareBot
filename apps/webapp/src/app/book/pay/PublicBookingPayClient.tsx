'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { classifyPaymentIntentStatus } from '@/shared/lib/paymentStatusView';
import { formatBookingDateTimeMediumRu } from '@/shared/lib/formatBusinessDateTime';
import { PaymentLinkQrCode } from '@/shared/ui/patient/PaymentLinkQrCode';
import toast from 'react-hot-toast';
import {
  patientBodyTextClass,
  patientMutedTextClass,
  patientPageTitleClass,
} from '@/shared/ui/patient/patientVisual';

const POLL_MS = 4000;

type Props = { bookingId: string; appDisplayTimeZone: string };

function formatRemaining(msLeft: number): string {
  const minutes = Math.ceil(msLeft / 60_000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  }
  return `${Math.max(1, minutes)} мин`;
}

export function PublicBookingPayClient({ bookingId, appDisplayTimeZone }: Props) {
  const router = useRouter();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [paymentDeadlineAt, setPaymentDeadlineAt] = useState<string | null>(null);
  const [appointmentStatus, setAppointmentStatus] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/booking/payment-status?bookingId=${encodeURIComponent(bookingId)}`,
    );
    const json = (await res.json()) as {
      ok?: boolean;
      intentId?: string | null;
      paymentDeadlineAt?: string | null;
      appointmentStatus?: string;
      summary?: {
        intent?: { amountMinor: number; status: string; checkoutUrl: string | null } | null;
      };
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? 'load_failed');
      return;
    }
    setIntentId(json.intentId ?? null);
    setAmountMinor(json.summary?.intent?.amountMinor ?? null);
    setIntentStatus(json.summary?.intent?.status ?? null);
    setCheckoutUrl(json.summary?.intent?.checkoutUrl ?? null);
    setPaymentDeadlineAt(json.paymentDeadlineAt ?? null);
    setAppointmentStatus(json.appointmentStatus ?? null);
  }, [bookingId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  const view = classifyPaymentIntentStatus(intentStatus);
  const deadlineMs = paymentDeadlineAt ? Date.parse(paymentDeadlineAt) : Number.NaN;
  const hasDeadline = Number.isFinite(deadlineMs);
  const deadlinePassed = hasDeadline && deadlineMs <= nowMs;
  const paymentStillExpected =
    appointmentStatus === null || appointmentStatus === 'awaiting_payment';
  const expired = view === 'pending' && (!paymentStillExpected || deadlinePassed);

  useEffect(() => {
    if (view !== 'pending' || !hasDeadline || expired) return;
    const untilDeadline = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.max(0, deadlineMs - Date.now()),
    );
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      window.clearTimeout(untilDeadline);
      window.clearInterval(tick);
    };
  }, [deadlineMs, expired, hasDeadline, view]);

  useEffect(() => {
    if (view !== 'pending' || expired) return;
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [view, expired, load]);

  useEffect(() => {
    if (view === 'succeeded') {
      toast.success('Оплата прошла');
      router.push(publicBookPaths.done);
    }
  }, [view, router]);

  function goToProvider() {
    if (!checkoutUrl) return;
    window.location.href = checkoutUrl;
  }

  const amountRub =
    amountMinor != null
      ? (amountMinor / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })
      : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className={patientPageTitleClass}>Оплата записи</h1>
      {amountRub ? <p className={patientBodyTextClass}>К оплате: {amountRub}</p> : null}
      {error ? <p className={`${patientBodyTextClass} text-destructive`}>{error}</p> : null}
      {view === 'succeeded' ? (
        <p className={patientBodyTextClass}>Оплата прошла</p>
      ) : expired ? (
        <p className={`${patientBodyTextClass} text-destructive`}>
          Оплата не поступила, бронирование отменено
        </p>
      ) : view === 'failed' ? (
        <p className={`${patientBodyTextClass} text-destructive`}>Оплата не прошла</p>
      ) : intentId && !checkoutUrl ? (
        <p className={`${patientBodyTextClass} text-destructive`}>
          Платёжный провайдер не настроен
        </p>
      ) : (
        <>
          {hasDeadline ? (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-lg font-semibold">
                Оплатить до {formatBookingDateTimeMediumRu(paymentDeadlineAt!, appDisplayTimeZone)}
              </p>
              <p className={patientBodyTextClass}>
                Осталось {formatRemaining(Math.max(0, deadlineMs - nowMs))}
              </p>
            </div>
          ) : null}
          {checkoutUrl ? (
            <a className={`${patientMutedTextClass} break-all underline`} href={checkoutUrl}>
              {checkoutUrl}
            </a>
          ) : null}
          <Button type="button" disabled={pending || !checkoutUrl} onClick={goToProvider}>
            Оплатить
          </Button>
          {checkoutUrl ? (
            <div className="hidden md:block">
              <PaymentLinkQrCode url={checkoutUrl} />
            </div>
          ) : null}
          {intentId ? (
            <p className={patientMutedTextClass}>
              Ожидаем подтверждение оплаты от платёжной системы…
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
