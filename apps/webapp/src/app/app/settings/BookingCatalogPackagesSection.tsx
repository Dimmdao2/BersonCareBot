"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { apiJson } from "@/shared/lib/apiJson";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";

const API = "/api/admin/booking-engine/packages";
const SERVICES_API = "/api/admin/booking-engine/services";

type ServiceRow = { id: string; title: string };
type PackageRow = {
  id: string;
  title: string;
  priceMinor: number;
  currency: string;
  items: Array<{ serviceId: string; quantity: number }>;
};

export function BookingCatalogPackagesSection({ apiBase = API }: { apiBase?: string }) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [title, setTitle] = useState("");
  const [priceRub, setPriceRub] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [items, setItems] = useState<Array<{ serviceId: string; quantity: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const [svcJson, pkgJson] = await Promise.all([
        apiJson<{ ok?: boolean; services?: ServiceRow[] }>(SERVICES_API),
        apiJson<{ ok?: boolean; packages?: PackageRow[] }>(apiBase),
      ]);
      if (svcJson.services) setServices(svcJson.services);
      if (pkgJson.packages) setPackages(pkgJson.packages);
    } catch {
      // load errors are non-critical; lists simply stay empty
    }
  }, [apiBase]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  function addItem() {
    if (!serviceId || !quantity.trim()) return;
    const q = Number.parseInt(quantity, 10);
    if (!Number.isFinite(q) || q < 1) return;
    setItems((prev) => [...prev, { serviceId, quantity: q }]);
    setServiceId("");
    setQuantity("1");
  }

  function save() {
    setError(null);
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(",", ".")) * 100);
    if (!title.trim() || !Number.isFinite(priceMinor) || priceMinor < 0 || items.length === 0) {
      setError("invalid_form");
      return;
    }
    startTransition(async () => {
      try {
        await apiJson(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), priceMinor, currency: "RUB", items }),
        });
        setTitle("");
        setPriceRub("");
        setItems([]);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "save_failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Абонементы (каталог)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="text-sm">
          {packages.map((p) => (
            <li key={p.id} className="border-b py-1">
              {p.title} — {(p.priceMinor / 100).toLocaleString("ru-RU")} ₽
            </li>
          ))}
        </ul>
        <div className="grid gap-2">
          <Label htmlFor="pkg-title">Название</Label>
          <Input id="pkg-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Label htmlFor="pkg-price">Цена (₽)</Label>
          <Input id="pkg-price" value={priceRub} onChange={(e) => setPriceRub(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-md border px-2 py-1 text-sm"
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
            <Input
              className="w-20"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-label="Количество"
            />
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              В состав
            </Button>
          </div>
          {items.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Состав:{" "}
              {items
                .map((it) => {
                  const t = services.find((s) => s.id === it.serviceId)?.title ?? it.serviceId;
                  return `${it.quantity}× ${t}`;
                })
                .join(", ")}
            </p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="button" disabled={pending} onClick={save}>
            Сохранить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
