"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/shared/ui/patient/primitives/button";
import { patientMutedTextClass } from "@/shared/ui/patient/patientVisual";

type PurchaseRow = {
  id: string;
  title: string;
  productType: string;
  status: string;
  priceMinor: number;
  fulfillmentJson?: { visitsRemaining?: number };
};

type CatalogRow = {
  id: string;
  title: string;
  priceMinor: number;
  productType: string;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Активна",
  awaiting_payment: "Ожидает оплаты",
  offered: "Предложена",
  used: "Использована",
  expired: "Истекла",
  cancelled: "Отменена",
};

export function PatientPurchasesClient() {
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([
      fetch("/api/booking/products"),
      fetch("/api/booking/products/catalog"),
    ]);
    const pJson = (await pRes.json()) as { ok?: boolean; purchases?: PurchaseRow[] };
    const cJson = (await cRes.json()) as { ok?: boolean; products?: CatalogRow[] };
    if (pJson.ok && pJson.purchases) setPurchases(pJson.purchases);
    if (cJson.ok && cJson.products) setCatalog(cJson.products);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  async function buy(productId: string) {
    startTransition(async () => {
      const res = await fetch("/api/booking/products/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        paymentIntentId?: string;
        error?: string;
      };
      if (!json.ok) return;
      if (json.paymentIntentId) {
        const mock = await fetch("/api/booking/products/payments/mock-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intentId: json.paymentIntentId }),
        });
        if (!(await mock.json()).ok) return;
      }
      await load();
    });
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Мои покупки</h2>
        {purchases.length === 0 ? (
          <p className={patientMutedTextClass}>Покупок пока нет.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {purchases.map((p) => (
              <li key={p.id} className="rounded-lg border p-3">
                <div className="font-medium">{p.title}</div>
                <div className={patientMutedTextClass}>
                  {STATUS_LABEL[p.status] ?? p.status}
                  {typeof p.fulfillmentJson?.visitsRemaining === "number"
                    ? ` · осталось визитов: ${p.fulfillmentJson.visitsRemaining}`
                    : null}
                </div>
                {p.status === "awaiting_payment" && p.priceMinor > 0 ? (
                  <Link
                    href={`/app/patient/purchases/pay?purchaseId=${p.id}`}
                    className="mt-2 inline-flex h-8 items-center justify-center rounded-md border px-3 text-sm"
                  >
                    Оплатить
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-medium">Доступные продукты</h2>
        {catalog.length === 0 ? (
          <p className={patientMutedTextClass}>Нет продуктов в каталоге.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {catalog.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <span>
                  {c.title} — {(c.priceMinor / 100).toLocaleString("ru-RU")} ₽
                </span>
                <Button type="button" size="sm" disabled={pending} onClick={() => buy(c.id)}>
                  Купить
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
