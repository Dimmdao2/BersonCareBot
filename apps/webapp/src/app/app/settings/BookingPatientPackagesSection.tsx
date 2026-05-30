"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  apiBase?: string;
  packagesApi?: string;
  servicesApi?: string;
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активен",
  expired: "Истёк",
  paid: "Оплачен",
};

const ERROR_LABELS: Record<string, string> = {
  platform_user_id_required: "Укажите ID пациента.",
  invalid_form: "Проверьте форму: название, цена и состав абонемента обязательны.",
  failed: "Не удалось выполнить операцию.",
};

function errorLabel(code: string | null): string | null {
  if (!code) return null;
  return ERROR_LABELS[code] ?? `Ошибка: ${code}`;
}

export function BookingPatientPackagesSection({
  apiBase = "/api/admin/booking-engine/patient-packages",
  packagesApi = "/api/admin/booking-engine/packages",
  servicesApi = "/api/admin/booking-engine/services",
}: Props) {
  const [platformUserId, setPlatformUserId] = useState("");
  const [catalogId, setCatalogId] = useState("");
  const [title, setTitle] = useState("");
  const [priceRub, setPriceRub] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [items, setItems] = useState<Array<{ serviceId: string; quantity: number }>>([]);
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; title: string }>>([]);
  const [resultId, setResultId] = useState<string | null>(null);
  const [listed, setListed] = useState<
    Array<{ id: string; title: string; status: string; balance: { items: Array<{ remaining: number }> } }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadRefs() {
    startTransition(async () => {
      const [svcRes, pkgRes] = await Promise.all([fetch(servicesApi), fetch(packagesApi)]);
      const svcJson = (await svcRes.json()) as { ok?: boolean; services?: Array<{ id: string; title: string }> };
      const pkgJson = (await pkgRes.json()) as { ok?: boolean; packages?: Array<{ id: string; title: string }> };
      if (svcJson.ok && svcJson.services) setServices(svcJson.services);
      if (pkgJson.ok && pkgJson.packages) setCatalog(pkgJson.packages);
    });
  }

  function addItem() {
    if (!serviceId) return;
    const q = Number.parseInt(quantity, 10);
    if (!Number.isFinite(q) || q < 1) return;
    setItems((prev) => [...prev, { serviceId, quantity: q }]);
  }

  function loadPatientPackages() {
    setError(null);
    if (!platformUserId.trim()) {
      setError("platform_user_id_required");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`${apiBase}?platformUserId=${encodeURIComponent(platformUserId.trim())}`);
      const json = (await res.json()) as {
        ok?: boolean;
        packages?: Array<{
          id: string;
          title: string;
          status: string;
          balance: { items: Array<{ remaining: number }> };
        }>;
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "failed");
        return;
      }
      setListed(json.packages ?? []);
    });
  }

  function offerCatalog() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "catalog",
          platformUserId: platformUserId.trim(),
          subscriptionPackageId: catalogId,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; package?: { id: string }; error?: string };
      if (!json.ok) {
        setError(json.error ?? "failed");
        return;
      }
      setResultId(json.package?.id ?? null);
    });
  }

  function createManual() {
    setError(null);
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(",", ".")) * 100);
    if (!platformUserId.trim() || !title.trim() || items.length === 0 || !Number.isFinite(priceMinor)) {
      setError("invalid_form");
      return;
    }
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "manual",
          platformUserId: platformUserId.trim(),
          title: title.trim(),
          priceMinor,
          items,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; package?: { id: string; paymentIntentId?: string }; error?: string };
      if (!json.ok) {
        setError(json.error ?? "failed");
        return;
      }
      setResultId(json.package?.id ?? null);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Абонемент пациента</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button type="button" variant="outline" size="sm" onClick={loadRefs}>
          Загрузить справочники
        </Button>
        <Label htmlFor="pp-user">ID пациента</Label>
        <Input id="pp-user" value={platformUserId} onChange={(e) => setPlatformUserId(e.target.value)} />
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={loadPatientPackages}>
          Абонементы пациента
        </Button>
        {listed.length > 0 ? (
          <ul className="text-sm">
            {listed.map((p) => (
              <li key={p.id}>
                {p.title} · {PACKAGE_STATUS_LABELS[p.status] ?? p.status} · остаток{" "}
                {p.balance.items.map((it) => it.remaining).join(", ")}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="border-t pt-3">
          <p className="mb-2 text-sm font-medium">Из каталога</p>
          <select
            className="mb-2 w-full rounded-md border px-2 py-1 text-sm"
            value={catalogId}
            onChange={(e) => setCatalogId(e.target.value)}
          >
            <option value="">Продукт</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Button type="button" disabled={pending} onClick={offerCatalog}>
            Назначить
          </Button>
        </div>
        <div className="border-t pt-3">
          <p className="mb-2 text-sm font-medium">Индивидуальный</p>
          <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input className="mt-2" placeholder="Цена ₽" value={priceRub} onChange={(e) => setPriceRub(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <select
              className="flex-1 rounded-md border px-2 py-1 text-sm"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">Услуга</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <Input className="w-16" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Кол-во" />
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              +
            </Button>
          </div>
          <Button type="button" className="mt-2" disabled={pending} onClick={createManual}>
            Создать и выставить оплату
          </Button>
        </div>
        {resultId ? (
          <p className="text-sm">
            Создан: {resultId}. Оплата: /app/patient/memberships/pay?patientPackageId={resultId}
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{errorLabel(error)}</p> : null}
      </CardContent>
    </Card>
  );
}
