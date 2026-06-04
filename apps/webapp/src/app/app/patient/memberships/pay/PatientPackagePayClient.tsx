"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/patient/primitives/button";
import { routePaths } from "@/app-layer/routes/paths";
import { patientButtonPrimaryClass, patientCardClass } from "@/shared/ui/patient/patientVisual";
import toast from "react-hot-toast";

type Props = { patientPackageId: string };

export function PatientPackagePayClient({ patientPackageId }: Props) {
  const router = useRouter();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const q = new URLSearchParams({ patientPackageId });
    const res = await fetch(`/api/booking/memberships/payment-status?${q.toString()}`);
    const json = (await res.json()) as {
      ok?: boolean;
      intentId?: string | null;
      priceMinor?: number;
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? "load_failed");
      return;
    }
    setIntentId(json.intentId ?? null);
    setAmountMinor(json.priceMinor ?? null);
  }, [patientPackageId]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  function payMock() {
    if (!intentId) return;
    startTransition(async () => {
      const res = await fetch("/api/booking/memberships/payments/mock-complete", {
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
    amountMinor != null
      ? (amountMinor / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB" })
      : null;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className={patientCardClass}>
        <p className="font-semibold">Оплата абонемента</p>
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
