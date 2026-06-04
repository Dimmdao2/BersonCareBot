"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/patient/primitives/button";
import { routePaths } from "@/app-layer/routes/paths";
import { patientButtonPrimaryClass, patientCardClass } from "@/shared/ui/patient/patientVisual";
import toast from "react-hot-toast";

type Props = { bookingId: string };

export function PatientBookingPayClient({ bookingId }: Props) {
  const router = useRouter();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch(`/api/booking/payment-status?bookingId=${encodeURIComponent(bookingId)}`);
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
  }, [bookingId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  function payMock() {
    if (!intentId) return;
    startTransition(async () => {
      const res = await fetch("/api/booking/payments/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "payment_failed");
        return;
      }
      toast.success("Оплата прошла");
      router.push(routePaths.patientBooking);
    });
  }

  const amountRub =
    amountMinor != null ? (amountMinor / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB" }) : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className={patientCardClass}>
        <p className="font-semibold">Оплата записи</p>
        {amountRub ? <p className="mt-2 text-sm">К оплате: {amountRub}</p> : null}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <Button
        type="button"
        className={patientButtonPrimaryClass}
        disabled={pending || !intentId}
        onClick={payMock}
      >
        Оплатить (тест)
      </Button>
    </div>
  );
}
