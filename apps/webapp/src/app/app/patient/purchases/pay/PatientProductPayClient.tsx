"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { routePaths } from "@/app-layer/routes/paths";

export function PatientProductPayClient(props: {
  purchaseId: string;
  intentId: string;
  title: string;
  amountMinor: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function pay() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/booking/products/payments/mock-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: props.intentId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "payment_failed");
        return;
      }
      router.push(routePaths.purchases);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p>
        {props.title} — {(props.amountMinor / 100).toLocaleString("ru-RU")} ₽
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" disabled={pending} onClick={pay}>
        Оплатить (тест)
      </Button>
    </div>
  );
}
