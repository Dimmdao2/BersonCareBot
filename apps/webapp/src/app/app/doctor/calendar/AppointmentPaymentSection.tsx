'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';

type Summary = {
  prepaymentQuote: { amountMinor: number; currency: string } | null;
  payment: { amountMinor: number; status: string } | null;
};
type Response = {
  summary?: Summary;
  error?: string;
  totalMinor?: number | null;
  manualPaidMinor?: number;
};

const money = (amountMinor: number, currency = 'RUB') =>
  (amountMinor / 100).toLocaleString('ru-RU', { style: 'currency', currency });

function errorLabel(error: string) {
  if (error === 'payments_disabled') return 'Приём платежей выключен для клиники.';
  if (error === 'payment_provider_unavailable' || error === 'payment_link_unavailable') {
    return 'Платёжный провайдер не настроен.';
  }
  if (error === 'appointment_amount_unavailable') return 'Стоимость записи не определена.';
  if (error === 'already_paid') return 'Запись уже оплачена.';
  return 'Не удалось выполнить действие.';
}

export function AppointmentPaymentSection({
  apiBase,
  appointmentId,
}: {
  apiBase: string;
  appointmentId: string;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [totalMinor, setTotalMinor] = useState<number | null>(null);
  const [manualPaidMinor, setManualPaidMinor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestVersion = useRef(0);

  const load = async (targetAppointmentId: string, version: number) => {
    const response = await fetch(
      `${apiBase}/appointments/${encodeURIComponent(targetAppointmentId)}/payment`,
    );
    const json = (await response.json()) as Response;
    if (!response.ok || !json.summary) throw new Error(json.error ?? 'not_found');
    if (version !== requestVersion.current) return;
    setSummary(json.summary);
    setTotalMinor(json.totalMinor ?? null);
    setManualPaidMinor(json.manualPaidMinor ?? 0);
  };

  useEffect(() => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    // A payment identity belongs to one appointment: clear it before starting the next read.
    setSummary(null);
    setTotalMinor(null);
    setManualPaidMinor(0);
    setError(null);
    setLink(null);
    void load(appointmentId, version).catch((cause: unknown) => {
      if (version === requestVersion.current) {
        setError(cause instanceof Error ? cause.message : 'not_found');
      }
    });
  }, [apiBase, appointmentId]);

  const run = (action: 'cash' | 'link') =>
    startTransition(async () => {
      const version = requestVersion.current;
      const targetAppointmentId = appointmentId;
      setError(null);
      try {
        const response = await fetch(
          `${apiBase}/appointments/${encodeURIComponent(targetAppointmentId)}/payment`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action }),
          },
        );
        const json = (await response.json()) as {
          ok?: boolean;
          error?: string;
          paymentLink?: string;
        };
        if (!response.ok || !json.ok) throw new Error(json.error ?? 'request_failed');
        if (version !== requestVersion.current) return;
        if (json.paymentLink) setLink(json.paymentLink);
        await load(targetAppointmentId, version);
      } catch (cause) {
        if (version === requestVersion.current) {
          setError(cause instanceof Error ? cause.message : 'request_failed');
        }
      }
    });

  const captured = summary?.payment?.status === 'succeeded' ? summary.payment.amountMinor : 0;
  const paid = captured + manualPaidMinor;
  const quote = summary?.prepaymentQuote?.amountMinor ?? null;
  const isSettled = totalMinor !== null && paid >= totalMinor;
  const canCollect = totalMinor !== null && totalMinor > paid;

  return (
    <section className="space-y-2 border-t border-border pt-3 text-sm" aria-label="Оплата записи">
      {isSettled ? (
        <p className="font-medium">Оплачено: {money(paid)}</p>
      ) : paid > 0 && totalMinor !== null ? (
        <p>
          Частично оплачено: {money(paid)} из {money(totalMinor)} · осталось{' '}
          {money(Math.max(0, totalMinor - paid))}
        </p>
      ) : quote ? (
        <p>Не оплачено · предоплата {money(quote, summary?.prepaymentQuote?.currency)}</p>
      ) : (
        <p>Не оплачено</p>
      )}
      {error ? (
        <p className="text-destructive" role="alert">
          {errorLabel(error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending || !canCollect}
          onClick={() => run('cash')}
        >
          Оплачено наличными
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending || !canCollect}
          onClick={() => run('link')}
        >
          Выставить счёт
        </Button>
      </div>
      {link ? (
        <div className="flex items-start gap-3">
          <a
            className="break-all text-primary underline"
            href={link}
            target="_blank"
            rel="noreferrer"
          >
            {link}
          </a>
          <img
            width="144"
            height="144"
            alt="QR-код платёжной ссылки"
            src={`https://quickchart.io/qr?size=144&text=${encodeURIComponent(link)}`}
          />
        </div>
      ) : null}
    </section>
  );
}
