"use client";

import { useState, useTransition } from "react";
import { apiJson } from "@/shared/lib/apiJson";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";

type Props = {
  apiBase?: string;
  servicesApi?: string;
  platformUserId?: string;
};

type PurchaseRow = {
  id: string;
  title: string;
  status: string;
  productType: string;
  fulfillmentJson: Record<string, unknown>;
};

const PRODUCT_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Ожидает оплаты",
  paid: "Оплачен",
  active: "Активен",
  consumed: "Использован",
  expired: "Истёк",
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  promo: "Акция",
  gift_certificate: "Подарочный",
  single_visit: "Разовый визит",
  course: "Курс",
  subscription: "Подписка",
};

const ERROR_LABELS: Record<string, string> = {
  platform_user_id_required: "Укажите ID пациента.",
  service_id_required: "Выберите услугу для списания.",
  consume_failed: "Не удалось списать визит.",
  failed: "Не удалось загрузить покупки.",
};

function errorLabel(code: string | null): string | null {
  if (!code) return null;
  return ERROR_LABELS[code] ?? `Ошибка: ${code}`;
}

export function BookingPatientProductsSection({
  apiBase = "/api/admin/booking-engine/patient-products",
  servicesApi = "/api/admin/booking-engine/services",
  platformUserId: platformUserIdProp = "",
}: Props) {
  const [platformUserIdLocal, setPlatformUserIdLocal] = useState("");
  const platformUserId = platformUserIdProp.trim() || platformUserIdLocal;
  const hidePatientIdField = Boolean(platformUserIdProp.trim());
  const [serviceId, setServiceId] = useState("");
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [listed, setListed] = useState<PurchaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadServices() {
    startTransition(async () => {
      try {
        const json = await apiJson<{ ok?: boolean; services?: Array<{ id: string; title: string }> }>(servicesApi);
        if (json.services) setServices(json.services);
      } catch {
        // services load failure is non-critical
      }
    });
  }

  async function fetchPurchases(): Promise<boolean> {
    try {
      const json = await apiJson<{ ok?: boolean; purchases?: PurchaseRow[]; error?: string }>(
        `${apiBase}?platformUserId=${encodeURIComponent(platformUserId.trim())}`,
      );
      setListed(json.purchases ?? []);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      return false;
    }
  }

  function loadPurchases() {
    setError(null);
    if (!platformUserId.trim()) {
      setError("platform_user_id_required");
      return;
    }
    startTransition(async () => {
      await fetchPurchases();
    });
  }

  function consume(purchaseId: string) {
    if (!serviceId.trim()) {
      setError("service_id_required");
      return;
    }
    if (!platformUserId.trim()) {
      setError("platform_user_id_required");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await apiJson(`${apiBase}/${purchaseId}/consume`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platformUserId: platformUserId.trim(), serviceId: serviceId.trim() }),
        });
        await fetchPurchases();
      } catch (e) {
        setError(e instanceof Error ? e.message : "consume_failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Покупки пациента</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" variant="outline" size="sm" onClick={loadServices}>
          Загрузить услуги
        </Button>
        {!hidePatientIdField ? (
          <>
            <Label htmlFor="pp-user">ID пациента</Label>
            <Input
              id="pp-user"
              value={platformUserIdLocal}
              onChange={(e) => setPlatformUserIdLocal(e.target.value)}
            />
          </>
        ) : null}
        <Label htmlFor="pp-svc">Услуга для списания</Label>
        <select
          id="pp-svc"
          className="rounded-md border px-2 py-1 text-sm"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          aria-label="Услуга"
        >
          <option value="">—</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <Button type="button" disabled={pending} onClick={loadPurchases}>
          Показать покупки
        </Button>
        <ul className="text-sm">
          {listed.map((p) => {
            const remaining =
              typeof p.fulfillmentJson.visitsRemaining === "number"
                ? p.fulfillmentJson.visitsRemaining
                : null;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1">
                <span>
                  {p.title} — {PRODUCT_STATUS_LABELS[p.status] ?? p.status}
                  {p.productType ? ` · ${PRODUCT_TYPE_LABELS[p.productType] ?? p.productType}` : ""}
                  {remaining != null ? ` (${remaining})` : ""}
                </span>
                {remaining != null && remaining > 0 ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => consume(p.id)}>
                    Списать визит
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {error ? <p className="text-sm text-destructive">{errorLabel(error)}</p> : null}
      </CardContent>
    </Card>
  );
}
