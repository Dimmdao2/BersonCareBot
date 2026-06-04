"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/patient/primitives/button";
import { publicBookPaths } from "@/shared/publicBook/paths";
import toast from "react-hot-toast";

type Props = { bookingId: string; contactPhone: string };

export function PublicBookingPayClient({ bookingId, contactPhone }: Props) {
  const router = useRouter();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ bookingId, phone: contactPhone });
    const res = await fetch(`/api/booking/public/payment-status?${q.toString()}`);
    const json = (await res.json()) as {
      ok?: boolean;
      intentId?: string | null;
      summary?: { intent?: { amountMinor: number } | null };
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? "load_failed");
      return;
    }
    setIntentId(json.intentId ?? null);
    setAmountMinor(json.summary?.intent?.amountMinor ?? null);
  }, [bookingId, contactPhone]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  function payMock() {
    if (!intentId) return;
    startTransition(async () => {
      const res = await fetch("/api/booking/public/payments/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId, bookingId, contactPhone }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "payment_failed");
        return;
      }
      toast.success("Оплата прошла");
      router.push(publicBookPaths.done);
    });
  }

  const amountRub =
    amountMinor != null ? (amountMinor / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB" }) : null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">Оплата записи</h1>
      {amountRub ? <p className="text-sm">К оплате: {amountRub}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={pending || !intentId} onClick={payMock}>
        Оплатить (тест)
      </Button>
    </div>
  );
}
