"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type PaymentSummary = {
  appointmentStatus: string;
  prepaymentQuote: { required: boolean; amountMinor: number; currency: string } | null;
  intent: { id: string; status: string; amountMinor: number } | null;
  payment: { id: string; status: string; amountMinor: number } | null;
  history: Array<{ eventType: string; amountMinor: number | null; occurredAt: string }>;
};

type Props = {
  apiBase: string;
  appointmentId: string;
};

function formatMinor(amountMinor: number, currency: string): string {
  return (amountMinor / 100).toLocaleString("ru-RU", { style: "currency", currency });
}

export function BookingStaffPaymentPanel({ apiBase, appointmentId }: Props) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    if (!appointmentId.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`${apiBase}/appointments/${encodeURIComponent(appointmentId.trim())}/payment`);
      const json = (await res.json()) as { ok?: boolean; summary?: PaymentSummary; error?: string };
      if (!json.ok || !json.summary) {
        setSummary(null);
        setError(json.error ?? "not_found");
        return;
      }
      setSummary(json.summary);
    });
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm">Оплата записи</Label>
        <Button type="button" variant="outline" size="sm" disabled={pending || !appointmentId.trim()} onClick={load}>
          Показать
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {summary ? (
        <div className="space-y-1 text-sm">
          <p>Статус записи: {summary.appointmentStatus}</p>
          {summary.prepaymentQuote?.required ? (
            <p>
              Предоплата: {formatMinor(summary.prepaymentQuote.amountMinor, summary.prepaymentQuote.currency)}
            </p>
          ) : null}
          {summary.intent ? (
            <p>
              Интент: {summary.intent.status}, {formatMinor(summary.intent.amountMinor, "RUB")}
            </p>
          ) : null}
          {summary.payment ? (
            <p>
              Платёж: {summary.payment.status}, {formatMinor(summary.payment.amountMinor, "RUB")}
            </p>
          ) : null}
          {summary.history.length > 0 ? (
            <ul className="list-disc pl-4 text-muted-foreground">
              {summary.history.slice(0, 8).map((h, index) => (
                <li key={`${h.eventType}-${h.occurredAt}-${index}`}>
                  {h.eventType}
                  {h.amountMinor != null ? ` · ${formatMinor(h.amountMinor, "RUB")}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
