"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { doctorClientStackedCardClass } from "./doctorClientCardChrome";

type PackageRow = {
  id: string;
  title: string;
  status: string;
  soldAt: string | null;
  paidAmountMinor: number | null;
  balance: {
    items: Array<{
      patientPackageItemId: string;
      serviceId: string;
      serviceTitle?: string | null;
      remaining: number;
      displayRemaining: number;
      reserved: number;
    }>;
  };
};

type AppointmentOption = { id: string; label: string };

const STATUS_LABELS: Record<string, string> = {
  active: "Активен",
  awaiting_payment: "Ожидает оплаты",
  offered: "Предложен",
};

const ERROR_LABELS: Record<string, string> = {
  invalid_form: "Проверьте название, цену и состав абонемента.",
  appointment_already_linked_to_package:
    "Запись уже связана с абонементом. Для будущей записи — «Отвязать»; для прошедшей со списанием — «Вернуть».",
  appointment_has_consumed_package_session:
    "У записи уже есть списание. Используйте «Вернуть списанный сеанс».",
  appointment_not_linked_to_package: "Запись не связана с абонементом.",
  package_no_balance: "Нет доступных сеансов по выбранной позиции.",
  load_failed: "Не удалось загрузить абонементы.",
};

type Props = {
  platformUserId: string;
  appointments?: AppointmentOption[];
};

export function DoctorClientMembershipsPanel({ platformUserId, appointments = [] }: Props) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [title, setTitle] = useState("");
  const [priceRub, setPriceRub] = useState("");
  const [soldDate, setSoldDate] = useState("");
  const [paidRub, setPaidRub] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [items, setItems] = useState<Array<{ serviceId: string; quantity: number }>>([]);
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; title: string; priceMinor: number }>>([]);
  const [catalogId, setCatalogId] = useState("");
  const [catalogSoldDate, setCatalogSoldDate] = useState("");
  const [catalogPaidRub, setCatalogPaidRub] = useState("");
  const [consumePackageId, setConsumePackageId] = useState("");
  const [consumeItemId, setConsumeItemId] = useState("");
  const [consumeAppointmentId, setConsumeAppointmentId] = useState("");
  const [unlinkAppointmentId, setUnlinkAppointmentId] = useState("");
  const [refundAppointmentId, setRefundAppointmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apiBase = "/api/doctor/booking-engine/patient-packages";
  const servicesApi = "/api/doctor/booking-engine/services";
  const catalogApi = "/api/doctor/booking-engine/packages";

  function showError(code: string | null, linkedAppointmentId?: string) {
    if (!code) {
      setError(null);
      return;
    }
    setError(ERROR_LABELS[code] ?? code);
    if (code === "appointment_already_linked_to_package" && linkedAppointmentId) {
      setUnlinkAppointmentId(linkedAppointmentId);
      setRefundAppointmentId(linkedAppointmentId);
    }
  }

  const loadPackages = useCallback(() => {
    startTransition(async () => {
      const res = await fetch(`${apiBase}?platformUserId=${encodeURIComponent(platformUserId)}`);
      const json = (await res.json()) as { ok?: boolean; packages?: PackageRow[]; error?: string };
      if (!json.ok) {
        showError(json.error ?? "load_failed");
        return;
      }
      setPackages(json.packages ?? []);
      setError(null);
    });
  }, [platformUserId]);

  useEffect(() => {
    loadPackages();
    void Promise.all([fetch(servicesApi), fetch(catalogApi)]).then(async ([svcRes, catRes]) => {
      const svcJson = (await svcRes.json()) as {
        ok?: boolean;
        services?: Array<{ id: string; title: string }>;
      };
      const catJson = (await catRes.json()) as {
        ok?: boolean;
        packages?: Array<{ id: string; title: string; priceMinor: number }>;
      };
      if (svcJson.ok && svcJson.services) setServices(svcJson.services);
      if (catJson.ok && catJson.packages) setCatalog(catJson.packages);
    });
  }, [loadPackages]);

  const compact = packages.filter((p) => p.status === "active" || p.status === "awaiting_payment");

  function addItem() {
    if (!serviceId) return;
    const q = Number.parseInt(quantity, 10);
    if (!Number.isFinite(q) || q < 1) return;
    setItems((prev) => [...prev, { serviceId, quantity: q }]);
  }

  function createManual() {
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(",", ".")) * 100);
    const paidAmountMinor = paidRub
      ? Math.round(Number.parseFloat(paidRub.replace(",", ".")) * 100)
      : priceMinor;
    if (!title.trim() || items.length === 0 || !Number.isFinite(priceMinor)) {
      showError("invalid_form");
      return;
    }
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "manual",
          platformUserId,
          title: title.trim(),
          priceMinor,
          items,
          sendForPayment: false,
          soldAt: soldDate ? new Date(soldDate).toISOString() : new Date().toISOString(),
          paidAmountMinor,
          activateImmediately: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? "create_failed");
        return;
      }
      setTitle("");
      setPriceRub("");
      setPaidRub("");
      setSoldDate("");
      setItems([]);
      loadPackages();
    });
  }

  function offerCatalog() {
    if (!catalogId) {
      showError("invalid_form");
      return;
    }
    const selected = catalog.find((c) => c.id === catalogId);
    const paidAmountMinor = catalogPaidRub
      ? Math.round(Number.parseFloat(catalogPaidRub.replace(",", ".")) * 100)
      : (selected?.priceMinor ?? 0);
    startTransition(async () => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "catalog",
          platformUserId,
          subscriptionPackageId: catalogId,
          soldAt: catalogSoldDate ? new Date(catalogSoldDate).toISOString() : new Date().toISOString(),
          paidAmountMinor,
          activateImmediately: true,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? "create_failed");
        return;
      }
      setCatalogId("");
      setCatalogPaidRub("");
      setCatalogSoldDate("");
      loadPackages();
    });
  }

  function manualConsume() {
    if (!consumePackageId || !consumeItemId) return;
    startTransition(async () => {
      const res = await fetch(`${apiBase}/${consumePackageId}/consume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientPackageItemId: consumeItemId,
          appointmentId: consumeAppointmentId || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? "consume_failed", consumeAppointmentId || undefined);
        return;
      }
      setError(null);
      loadPackages();
    });
  }

  function unlinkReserve() {
    if (!unlinkAppointmentId) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/doctor/booking-engine/appointments/${unlinkAppointmentId}/package/unlink`,
        { method: "POST" },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        showError(json.error ?? "unlink_failed");
        return;
      }
      setError(null);
      loadPackages();
    });
  }

  function refundConsumed() {
    if (!refundAppointmentId) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/doctor/booking-engine/appointments/${refundAppointmentId}/package/refund`,
        { method: "POST" },
      );
      const resJson = (await res.json()) as { ok?: boolean; error?: string };
      if (!resJson.ok) {
        showError(resJson.error ?? "refund_failed");
        return;
      }
      setError(null);
      loadPackages();
    });
  }

  const selectedPkg = packages.find((p) => p.id === consumePackageId);

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {compact.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет активных абонементов.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {compact.map((pkg) => (
            <li key={pkg.id} className={doctorClientStackedCardClass}>
              <p className="font-medium">{pkg.title}</p>
              <p className="text-muted-foreground text-xs">
                {STATUS_LABELS[pkg.status] ?? pkg.status}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {pkg.balance.items.map((it) => (
                  <li key={it.serviceId}>
                    {it.serviceTitle ?? it.serviceId}: остаток {it.displayRemaining}
                    {it.reserved > 0 ? ` (зарезервировано ${it.reserved})` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Назначить из каталога</summary>
        <div className="mt-3 flex flex-col gap-2">
          <Label htmlFor="pkg-catalog">Шаблон</Label>
          <select
            id="pkg-catalog"
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
            value={catalogId}
            onChange={(e) => {
              setCatalogId(e.target.value);
              const row = catalog.find((c) => c.id === e.target.value);
              if (row) setCatalogPaidRub(String(row.priceMinor / 100));
            }}
          >
            <option value="">—</option>
            {catalog.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <Label htmlFor="pkg-catalog-sold">Дата продажи</Label>
          <Input
            id="pkg-catalog-sold"
            type="date"
            value={catalogSoldDate}
            onChange={(e) => setCatalogSoldDate(e.target.value)}
          />
          <Label htmlFor="pkg-catalog-paid">Оплачено, ₽</Label>
          <Input
            id="pkg-catalog-paid"
            value={catalogPaidRub}
            onChange={(e) => setCatalogPaidRub(e.target.value)}
          />
          <Button type="button" size="sm" disabled={pending} onClick={offerCatalog}>
            Назначить
          </Button>
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Индивидуальный абонемент</summary>
        <div className="mt-3 flex flex-col gap-2">
          <Label htmlFor="pkg-title">Название</Label>
          <Input id="pkg-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Label htmlFor="pkg-price">Цена, ₽</Label>
          <Input id="pkg-price" value={priceRub} onChange={(e) => setPriceRub(e.target.value)} />
          <Label htmlFor="pkg-sold">Дата продажи</Label>
          <Input id="pkg-sold" type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} />
          <Label htmlFor="pkg-paid">Оплачено, ₽</Label>
          <Input id="pkg-paid" value={paidRub} onChange={(e) => setPaidRub(e.target.value)} />
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[8rem]">
              <Label htmlFor="pkg-svc">Услуга</Label>
              <select
                id="pkg-svc"
                className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">—</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-20">
              <Label htmlFor="pkg-qty">Кол-во</Label>
              <Input id="pkg-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addItem}>
              Добавить позицию
            </Button>
          </div>
          {items.length > 0 ? (
            <p className="text-xs text-muted-foreground">Позиций: {items.length}</p>
          ) : null}
          <Button type="button" size="sm" disabled={pending} onClick={createManual}>
            Сохранить
          </Button>
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Списать сеанс по абонементу</summary>
        <div className="mt-3 flex flex-col gap-2">
          <Label>Абонемент</Label>
          <select
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
            value={consumePackageId}
            onChange={(e) => {
              setConsumePackageId(e.target.value);
              setConsumeItemId("");
            }}
          >
            <option value="">—</option>
            {packages
              .filter((p) => p.status === "active")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>
          {selectedPkg ? (
            <>
              <Label>Позиция</Label>
              <select
                className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
                value={consumeItemId}
                onChange={(e) => setConsumeItemId(e.target.value)}
              >
                <option value="">—</option>
                {selectedPkg.balance.items.map((it) => (
                  <option key={it.patientPackageItemId} value={it.patientPackageItemId}>
                    {(it.serviceTitle ?? it.serviceId) + ` (остаток ${it.remaining})`}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <Label>Запись</Label>
          <select
            className="border-input bg-background w-full rounded-md border px-2 py-1 text-sm"
            value={consumeAppointmentId}
            onChange={(e) => setConsumeAppointmentId(e.target.value)}
          >
            <option value="">Без записи</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <Button type="button" size="sm" disabled={pending} onClick={manualConsume}>
            Списать
          </Button>
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">Отвязать / вернуть сеанс</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div>
            <Label>Отвязать будущий резерв (ID записи)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={unlinkAppointmentId}
                onChange={(e) => setUnlinkAppointmentId(e.target.value)}
                placeholder={appointments[0]?.id ?? "uuid"}
              />
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={unlinkReserve}>
                Отвязать
              </Button>
            </div>
          </div>
          <div>
            <Label>Вернуть списанный сеанс (ID записи)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={refundAppointmentId}
                onChange={(e) => setRefundAppointmentId(e.target.value)}
                placeholder={appointments[0]?.id ?? "uuid"}
              />
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={refundConsumed}>
                Вернуть
              </Button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
