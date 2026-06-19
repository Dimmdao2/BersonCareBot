"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";

type Props = {
  apiBase?: string;
  packagesApi?: string;
  servicesApi?: string;
  /** Если задан снаружи (поиск пациента), поле UUID не показываем. */
  platformUserId?: string;
};

const PACKAGE_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  active: "Активен",
  expired: "Истёк",
  paid: "Оплачен",
};

const ERROR_LABELS: Record<string, string> = {
  platform_user_id_required: "Укажите ID пациента.",
  catalog_package_required: "Выберите абонемент из каталога.",
  invalid_form: "Проверьте форму: цена и состав абонемента обязательны.",
  invalid_body: "Некорректные данные запроса.",
  catalog_not_found: "Абонемент не найден в каталоге.",
  payments_disabled: "Оплата отключена — абонемент создан, но ссылку на оплату выставить нельзя.",
  payment_provider_unavailable: "Платёжный провайдер не настроен — абонемент создан без онлайн-оплаты.",
  payments_unavailable: "Модуль оплаты недоступен.",
  failed: "Не удалось выполнить операцию.",
  response_parse_failed: "Ошибка ответа сервера.",
};

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function errorLabel(code: string | null): string | null {
  if (!code) return null;
  return ERROR_LABELS[code] ?? `Ошибка: ${code}`;
}

export function BookingPatientPackagesSection({
  apiBase = "/api/admin/booking-engine/patient-packages",
  packagesApi = "/api/admin/booking-engine/packages",
  servicesApi = "/api/admin/booking-engine/services",
  platformUserId: platformUserIdProp = "",
}: Props) {
  const [platformUserIdLocal, setPlatformUserIdLocal] = useState("");
  const platformUserId = platformUserIdProp.trim() || platformUserIdLocal;
  const hidePatientIdField = Boolean(platformUserIdProp.trim());
  const [catalogId, setCatalogId] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [catalogNotes, setCatalogNotes] = useState("");
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
      try {
        const [svcRes, pkgRes] = await Promise.all([fetch(servicesApi), fetch(packagesApi)]);
        const svcJson = await readJsonSafe<{ ok?: boolean; services?: Array<{ id: string; title: string }> }>(svcRes);
        const pkgJson = await readJsonSafe<{ ok?: boolean; packages?: Array<{ id: string; title: string }> }>(pkgRes);
        if (svcJson?.ok && svcJson.services) setServices(svcJson.services);
        if (pkgJson?.ok && pkgJson.packages) setCatalog(pkgJson.packages);
      } catch {
        // refs load failure is non-critical
      }
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
      try {
        const res = await fetch(`${apiBase}?platformUserId=${encodeURIComponent(platformUserId.trim())}`);
        const json = await readJsonSafe<{
          ok?: boolean;
          packages?: Array<{
            id: string;
            title: string;
            status: string;
            balance: { items: Array<{ remaining: number }> };
          }>;
          error?: string;
        }>(res);
        if (!json) {
          setError("response_parse_failed");
          return;
        }
        if (!json.ok) {
          setError(json.error ?? "failed");
          return;
        }
        setListed(json.packages ?? []);
      } catch {
        setError("Ошибка сети");
      }
    });
  }

  function offerCatalog() {
    setError(null);
    if (!platformUserId.trim()) {
      setError("platform_user_id_required");
      return;
    }
    if (!catalogId) {
      setError("catalog_package_required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "catalog",
            platformUserId: platformUserId.trim(),
            subscriptionPackageId: catalogId,
            notes: catalogNotes.trim() || undefined,
          }),
        });
        const json = await readJsonSafe<{ ok?: boolean; package?: { id: string }; error?: string }>(res);
        if (!json) {
          setError("response_parse_failed");
          return;
        }
        if (!json.ok) {
          setError(json.error ?? "failed");
          return;
        }
        setResultId(json.package?.id ?? null);
      } catch {
        setError("Ошибка сети");
      }
    });
  }

  function createManual() {
    setError(null);
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(",", ".")) * 100);
    if (!platformUserId.trim() || items.length === 0 || !Number.isFinite(priceMinor)) {
      setError("invalid_form");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "manual",
            platformUserId: platformUserId.trim(),
            notes: manualNotes.trim() || undefined,
            priceMinor,
            items,
          }),
        });
        const json = await readJsonSafe<{
          ok?: boolean;
          package?: { id: string; paymentIntentId?: string };
          error?: string;
        }>(res);
        if (!json) {
          setError("response_parse_failed");
          return;
        }
        if (!json.ok) {
          setError(json.error ?? "failed");
          return;
        }
        setResultId(json.package?.id ?? null);
      } catch {
        setError("Ошибка сети");
      }
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
          <Input
            className="mb-2"
            placeholder="Комментарий"
            value={catalogNotes}
            onChange={(e) => setCatalogNotes(e.target.value)}
          />
          <Button type="button" disabled={pending} onClick={offerCatalog}>
            Назначить
          </Button>
        </div>
        <div className="border-t pt-3">
          <p className="mb-2 text-sm font-medium">Индивидуальный</p>
          <Input
            placeholder="Комментарий"
            value={manualNotes}
            onChange={(e) => setManualNotes(e.target.value)}
          />
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
