'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/shared/ui/patient/primitives/button';
import { publicBookPaths } from '@/shared/publicBook/paths';
import { classifyPaymentIntentStatus } from '@/shared/lib/paymentStatusView';
import toast from 'react-hot-toast';

const POLL_MS = 4000;

type Props = { purchaseId: string; contactPhone: string };

export function PublicProductPayClient({ purchaseId, contactPhone }: Props) {
  const router = useRouter();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [intentStatus, setIntentStatus] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ purchaseId, phone: contactPhone });
    const res = await fetch(`/api/booking/public/products/payment-status?${q.toString()}`);
    const json = (await res.json()) as {
      ok?: boolean;
      intentId?: string | null;
      intentStatus?: string | null;
      checkoutUrl?: string | null;
      amountMinor?: number;
      title?: string;
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? 'load_failed');
      return;
    }
    setIntentId(json.intentId ?? null);
    setAmountMinor(json.amountMinor ?? null);
    setTitle(json.title ?? null);
    setIntentStatus(json.intentStatus ?? null);
    setCheckoutUrl(json.checkoutUrl ?? null);
  }, [purchaseId, contactPhone]);

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
      <h1 className="text-lg font-semibold">Оплата{title ? `: ${title}` : ''}</h1>
      {amountRub ? <p className="text-sm">К оплате: {amountRub}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {view === 'succeeded' ? (
        <p className="text-sm font-medium">Оплата прошла</p>
      ) : view === 'failed' ? (
        <p className="text-sm font-medium text-destructive">Оплата не прошла</p>
      ) : intentId && !checkoutUrl ? (
        <p className="text-sm font-medium text-destructive">Платёжный провайдер не настроен</p>
      ) : (
        <>
          <Button type="button" disabled={pending || !checkoutUrl} onClick={goToProvider}>
            Оплатить
          </Button>
          {intentId ? (
            <p className="text-sm text-muted-foreground">
              Ожидаем подтверждение оплаты от платёжной системы…
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
