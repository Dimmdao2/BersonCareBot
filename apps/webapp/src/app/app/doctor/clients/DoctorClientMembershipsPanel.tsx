"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { PatientPackageCard, type PatientPackageCardRow } from "./PatientPackageCard";

type AppointmentOption = { id: string; label: string };

const ERROR_LABELS: Record<string, string> = {
  invalid_form: "Проверьте цену и состав абонемента.",
  appointment_already_linked_to_package:
    "Запись уже связана с абонементом. Откройте абонемент и выполните действие в списке записей.",
  appointment_has_consumed_package_session:
    "У записи уже есть списание. Используйте «Вернуть сеанс» в списке записей абонемента.",
  appointment_not_linked_to_package: "Запись не связана с абонементом.",
  package_no_balance: "Нет доступных сеансов по выбранной позиции.",
  load_failed: "Не удалось загрузить абонементы.",
  late_detach_choice_required: "Выберите исход поздней отвязки в диалоге.",
  past_detach_confirmation_required: "Нужно двойное подтверждение для прошедшей записи.",
  past_unlink_not_allowed: "Отвязка прошедших записей отключена в настройках.",
};

type Props = {
  platformUserId: string;
  appointments?: AppointmentOption[];
};

export function DoctorClientMembershipsPanel({ platformUserId, appointments = [] }: Props) {
  const [packages, setPackages] = useState<PatientPackageCardRow[]>([]);
  const [priceRub, setPriceRub] = useState("");
  const [soldDate, setSoldDate] = useState("");
  const [paidRub, setPaidRub] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [items, setItems] = useState<Array<{ serviceId: string; quantity: number }>>([]);
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [catalog, setCatalog] = useState<Array<{ id: string; title: string; priceMinor: number }>>([]);
  const [catalogId, setCatalogId] = useState("");
  const [catalogSoldDate, setCatalogSoldDate] = useState("");
  const [catalogPaidRub, setCatalogPaidRub] = useState("");
  const [catalogNotes, setCatalogNotes] = useState("");
  const [consumePackageId, setConsumePackageId] = useState("");
  const [consumeItemId, setConsumeItemId] = useState("");
  const [consumeAppointmentId, setConsumeAppointmentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apiBase = "/api/doctor/booking-engine/patient-packages";
  const servicesApi = "/api/doctor/booking-engine/services";
  const catalogApi = "/api/doctor/booking-engine/packages";

  function showError(code: string | null) {
    if (!code) {
      setError(null);
      return;
    }
    setError(ERROR_LABELS[code] ?? code);
  }

  const loadPackages = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}?platformUserId=${encodeURIComponent(platformUserId)}`);
      const json = (await res.json()) as {
        ok?: boolean;
        packages?: PatientPackageCardRow[];
        error?: string;
      };
      if (!json.ok) {
        showError(json.error ?? "load_failed");
        return;
      }
      setPackages(json.packages ?? []);
      setError(null);
    } catch {
      showError("load_failed");
    }
  }, [platformUserId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPackages();
    });
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
    if (items.length === 0 || !Number.isFinite(priceMinor)) {
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
          notes: manualNotes.trim() || undefined,
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
      setPriceRub("");
      setPaidRub("");
      setSoldDate("");
      setManualNotes("");
      setItems([]);
      void loadPackages();
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
          notes: catalogNotes.trim() || undefined,
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
      setCatalogNotes("");
      void loadPackages();
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
        showError(json.error ?? "consume_failed");
        return;
      }
      setError(null);
      void loadPackages();
    });
  }

  const selectedPkg = packages.find((p) => p.id === consumePackageId);

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {compact.length === 0 ? (
        <p className="text-muted-foreground text-sm">Нет активных абонементов.</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0">
          {compact.map((pkg) => (
            <PatientPackageCard
              key={pkg.id}
              pkg={pkg}
              apiBase={apiBase}
              onError={showError}
              onChanged={() => void loadPackages()}
            />
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
          <Label htmlFor="pkg-catalog-notes">Комментарий</Label>
          <Input
            id="pkg-catalog-notes"
            value={catalogNotes}
            onChange={(e) => setCatalogNotes(e.target.value)}
          />
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
          <Label htmlFor="pkg-manual-notes">Комментарий</Label>
          <Input
            id="pkg-manual-notes"
            value={manualNotes}
            onChange={(e) => setManualNotes(e.target.value)}
          />
          <Label htmlFor="pkg-price">Цена, ₽</Label>
          <Input id="pkg-price" value={priceRub} onChange={(e) => setPriceRub(e.target.value)} />
          <Label htmlFor="pkg-sold">Дата продажи</Label>
          <Input id="pkg-sold" type="date" value={soldDate} onChange={(e) => setSoldDate(e.target.value)} />
          <Label htmlFor="pkg-paid">Оплачено, ₽</Label>
          <Input id="pkg-paid" value={paidRub} onChange={(e) => setPaidRub(e.target.value)} />
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[8rem] flex-1">
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
            <p className="text-muted-foreground text-xs">Позиций: {items.length}</p>
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
    </div>
  );
}
