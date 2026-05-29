"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  apiBase?: string;
  servicesApi?: string;
};

type PurchaseRow = {
  id: string;
  title: string;
  status: string;
  productType: string;
  fulfillmentJson: Record<string, unknown>;
};

export function BookingPatientProductsSection({
  apiBase = "/api/admin/booking-engine/patient-products",
  servicesApi = "/api/admin/booking-engine/services",
}: Props) {
  const [platformUserId, setPlatformUserId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [listed, setListed] = useState<PurchaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadServices() {
    startTransition(async () => {
      const res = await fetch(servicesApi);
      const json = (await res.json()) as { ok?: boolean; services?: Array<{ id: string; title: string }> };
      if (json.ok && json.services) setServices(json.services);
    });
  }

  async function fetchPurchases(): Promise<boolean> {
    const res = await fetch(`${apiBase}?platformUserId=${encodeURIComponent(platformUserId.trim())}`);
    const json = (await res.json()) as { ok?: boolean; purchases?: PurchaseRow[]; error?: string };
    if (!json.ok) {
      setError(json.error ?? "failed");
      return false;
    }
    setListed(json.purchases ?? []);
    return true;
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
      const res = await fetch(`${apiBase}/${purchaseId}/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformUserId: platformUserId.trim(), serviceId: serviceId.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "consume_failed");
        return;
      }
      await fetchPurchases();
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
        <Label htmlFor="pp-user">Platform user ID</Label>
        <Input id="pp-user" value={platformUserId} onChange={(e) => setPlatformUserId(e.target.value)} />
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
                  {p.title} — {p.status}
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
