'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import { routePaths } from '@/app-layer/routes/paths';
import {
  patientButtonPrimaryClass,
  patientCardClass,
  patientMutedTextClass,
  patientSurfaceDangerClass,
  patientSurfaceSuccessClass,
  patientSurfaceWarningClass,
} from '@/shared/ui/patient/patientVisual';
import { classifyPaymentIntentStatus } from '@/shared/lib/paymentStatusView';
import toast from 'react-hot-toast';

const POLL_MS = 4000;

type Props = { bookingId: string };

export function PatientBookingPayClient({ bookingId }: Props) {
  const router = useRouter();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/booking/payment-status?bookingId=${encodeURIComponent(bookingId)}`,
    );
    const json = (await res.json()) as {
      ok?: boolean;
      intentId?: string | null;
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
  }, [bookingId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  const view = classifyPaymentIntentStatus(intentStatus);

  useEffect(() => {
    if (view !== 'pending') return;
    const id = window.setInterval(() => {
      void load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [view, load]);

  useEffect(() => {
    if (view === 'succeeded') {
      toast.success('Оплата прошла');
      router.push(routePaths.patientBooking);
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
    <div className="flex flex-col gap-4 p-4">
      <div className={patientCardClass}>
        <p className="font-semibold">Оплата записи</p>
        {amountRub ? <p className="mt-2 text-sm">К оплате: {amountRub}</p> : null}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      {view === 'succeeded' ? (
        <div className={patientSurfaceSuccessClass}>
          <p className="text-sm font-medium">Оплата прошла</p>
        </div>
      ) : view === 'failed' ? (
        <div className={patientSurfaceDangerClass}>
          <p className="text-sm font-medium">Оплата не прошла</p>
        </div>
      ) : intentId && !checkoutUrl ? (
        <div className={patientSurfaceWarningClass}>
          <p className="text-sm font-medium">Платёжный провайдер не настроен</p>
        </div>
      ) : (
        <>
          <Button
            type="button"
            className={patientButtonPrimaryClass}
            disabled={pending || !checkoutUrl}
            onClick={goToProvider}
          >
            Оплатить
          </Button>
          {intentId ? (
            <p className={patientMutedTextClass}>Ожидаем подтверждение оплаты от платёжной системы…</p>
          ) : null}
        </>
      )}
    </div>
  );
}
