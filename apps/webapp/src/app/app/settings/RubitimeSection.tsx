"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CatalogCity = {
  id: string;
  code: string;
  title: string;
  isActive: boolean;
  sortOrder: number;
};

type CatalogBranch = {
  id: string;
  cityId: string;
  title: string;
  address: string | null;
  rubitimeBranchId: string;
  isActive: boolean;
  sortOrder: number;
};

type CatalogService = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  isActive: boolean;
  sortOrder: number;
};

type CatalogSpecialist = {
  id: string;
  branchId: string;
  fullName: string;
  description: string | null;
  rubitimeCooperatorId: string;
  isActive: boolean;
  sortOrder: number;
};

type CatalogBranchService = {
  id: string;
  branchId: string;
  serviceId: string;
  specialistId: string;
  rubitimeServiceId: string;
  isActive: boolean;
  sortOrder: number;
};

const BASE = "/api/admin/booking-catalog";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return res.json() as Promise<T>;
}

function formatPriceMinor(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ₽`;
}

export function RubitimeSection() {
  const [cities, setCities] = useState<CatalogCity[]>([]);
  const [branches, setBranches] = useState<CatalogBranch[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [specialists, setSpecialists] = useState<CatalogSpecialist[]>([]);
  const [branchServices, setBranchServices] = useState<CatalogBranchService[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [isPending, start] = useTransition();

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setCatalogUnavailable(false);
    setActionError(null);
    try {
      const [cRes, bRes, sRes, spRes, bsRes] = await Promise.all([
        apiJson<{ ok: boolean; cities?: CatalogCity[]; error?: string }>(`${BASE}/cities`),
        apiJson<{ ok: boolean; branches?: CatalogBranch[]; error?: string }>(`${BASE}/branches`),
        apiJson<{ ok: boolean; services?: CatalogService[]; error?: string }>(`${BASE}/services`),
        apiJson<{ ok: boolean; specialists?: CatalogSpecialist[]; error?: string }>(`${BASE}/specialists`),
        apiJson<{ ok: boolean; branchServices?: CatalogBranchService[]; error?: string }>(
          `${BASE}/branch-services`,
        ),
      ]);
      if (!cRes.ok && cRes.error === "catalog_unavailable") {
        setCatalogUnavailable(true);
        return;
      }
      if (cRes.ok && Array.isArray(cRes.cities)) setCities(cRes.cities);
      if (bRes.ok && Array.isArray(bRes.branches)) setBranches(bRes.branches);
      if (sRes.ok && Array.isArray(sRes.services)) setServices(sRes.services);
      if (spRes.ok && Array.isArray(spRes.specialists)) setSpecialists(spRes.specialists);
      if (bsRes.ok && Array.isArray(bsRes.branchServices)) setBranchServices(bsRes.branchServices);
      const failed = [cRes, bRes, sRes, spRes, bsRes].find((r) => !r.ok);
      if (failed && !failed.ok && failed.error !== "catalog_unavailable") {
        setLoadError(String(failed.error ?? "Ошибка загрузки"));
      }
    } catch {
      setLoadError("Не удалось загрузить каталог");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function deleteEntity(
    kind: "cities" | "branches" | "services" | "specialists" | "branch-services",
    id: string,
  ) {
    start(async () => {
      setActionError(null);
      try {
        const res = await fetch(`${BASE}/${kind}/${id}`, { method: "DELETE" });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || data.ok === false) {
          setActionError(String(data.error ?? `HTTP ${res.status}`));
          return;
        }
        await loadAll();
      } catch {
        setActionError("Не удалось выполнить запрос");
      }
    });
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Каталог записи (v2)</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {catalogUnavailable && (
          <p className="text-sm text-destructive">
            Каталог недоступен (нет подключения к БД или миграции 046). Проверьте DATABASE_URL и миграции.
          </p>
        )}
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {actionError && <p className="text-sm text-destructive">{actionError}</p>}

        <p className="text-xs text-muted-foreground">
          Управление каталогом город → филиал → специалист → услуга → связка филиал–услуга. Rubitime ID
          (branch / cooperator / service) показаны для сверки с кабинетом Rubitime.
        </p>

        {/* Cities */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Города</p>
          {cities.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
            >
              <span>
                <span className="font-mono">{c.code}</span> — {c.title}
                {!c.isActive && <span className="ml-1 text-muted-foreground">(неактивен)</span>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteEntity("cities", c.id)}
                disabled={isPending}
              >
                ✕
              </Button>
            </div>
          ))}
          <CityForm onDone={() => void loadAll()} />
        </section>

        {/* Branches */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Филиалы</p>
          {branches.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-mono">rubitime_branch_id: {b.rubitimeBranchId}</span>
                  {" — "}
                  {b.title}
                  {!b.isActive && <span className="ml-1 text-muted-foreground">(неактивен)</span>}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteEntity("branches", b.id)}
                  disabled={isPending}
                >
                  ✕
                </Button>
              </div>
              <span className="text-muted-foreground">
                city_id: {b.cityId}
                {b.address ? ` · ${b.address}` : ""}
              </span>
            </div>
          ))}
          <BranchForm cities={cities} onDone={() => void loadAll()} />
        </section>

        {/* Specialists — до услуг, как в BookingCatalogHelp */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Специалисты</p>
          {specialists.map((sp) => {
            const br = branches.find((x) => x.id === sp.branchId);
            return (
              <div
                key={sp.id}
                className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-mono">rubitime_cooperator_id: {sp.rubitimeCooperatorId}</span>
                    {" — "}
                    {sp.fullName}
                    {!sp.isActive && <span className="ml-1 text-muted-foreground">(неактивен)</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteEntity("specialists", sp.id)}
                    disabled={isPending}
                  >
                    ✕
                  </Button>
                </div>
                <span className="text-muted-foreground">
                  branch: {br?.title ?? sp.branchId}
                </span>
              </div>
            );
          })}
          <SpecialistForm branches={branches} onDone={() => void loadAll()} />
        </section>

        {/* Services */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Услуги (глобальный каталог)</p>
          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
            >
              <span>
                {s.title} · {s.durationMinutes} мин · {formatPriceMinor(s.priceMinor)}
                {!s.isActive && <span className="ml-1 text-muted-foreground">(неактивна)</span>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => deleteEntity("services", s.id)}
                disabled={isPending}
              >
                ✕
              </Button>
            </div>
          ))}
          <ServiceForm onDone={() => void loadAll()} />
        </section>

        {/* Branch-service */}
        <section className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Связки филиал — услуга (branch-service)</p>
          {branchServices.map((bs) => {
            const br = branches.find((x) => x.id === bs.branchId);
            const svc = services.find((x) => x.id === bs.serviceId);
            const sp = specialists.find((x) => x.id === bs.specialistId);
            return (
              <div
                key={bs.id}
                className="flex flex-col gap-0.5 rounded-md border border-border px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-mono">rubitime_service_id: {bs.rubitimeServiceId}</span>
                    {!bs.isActive && <span className="ml-1 text-muted-foreground">(неактивна)</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteEntity("branch-services", bs.id)}
                    disabled={isPending}
                  >
                    ✕
                  </Button>
                </div>
                <span className="text-muted-foreground">
                  {br?.title ?? bs.branchId} · {svc?.title ?? bs.serviceId} · {sp?.fullName ?? bs.specialistId}
                </span>
              </div>
            );
          })}
          <BranchServiceForm
            branches={branches}
            services={services}
            specialists={specialists}
            onDone={() => void loadAll()}
          />
        </section>
      </CardContent>
    </Card>
  );
}

function CityForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function save() {
    setErr(null);
    if (!code.trim()) {
      setErr("Код города обязателен");
      return;
    }
    if (!title.trim()) {
      setErr("Название обязательно");
      return;
    }
    const c = code.trim().toLowerCase();
    start(async () => {
      const res = await apiJson<{ ok: boolean; error?: string }>(`${BASE}/cities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: c,
          title: title.trim(),
          sortOrder: Number.parseInt(sortOrder, 10) || 0,
        }),
      });
      if (!res.ok) {
        setErr(String(res.error ?? "Ошибка"));
        return;
      }
      setCode("");
      setTitle("");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить город</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input-base"
          placeholder="Код (moscow, spb)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base"
          placeholder="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base"
          placeholder="Порядок сортировки"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          disabled={isPending}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={save} disabled={isPending}>
        {isPending ? "Сохранение..." : "Сохранить город"}
      </Button>
    </div>
  );
}

function BranchForm({ cities, onDone }: { cities: CatalogCity[]; onDone: () => void }) {
  const [cityCode, setCityCode] = useState("");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [rubitimeBranchId, setRubitimeBranchId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function save() {
    setErr(null);
    if (!cityCode.trim() || !title.trim() || !rubitimeBranchId.trim()) {
      setErr("Город, название и Rubitime Branch ID обязательны");
      return;
    }
    start(async () => {
      const res = await apiJson<{ ok: boolean; error?: string }>(`${BASE}/branches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityCode: cityCode.trim().toLowerCase(),
          title: title.trim(),
          address: address.trim() || null,
          rubitimeBranchId: rubitimeBranchId.trim(),
        }),
      });
      if (!res.ok) {
        setErr(String(res.error ?? "Ошибка"));
        return;
      }
      setTitle("");
      setAddress("");
      setRubitimeBranchId("");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить филиал</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="input-base"
          value={cityCode}
          onChange={(e) => setCityCode(e.target.value)}
          disabled={isPending}
        >
          <option value="">— город —</option>
          {cities.map((c) => (
            <option key={c.id} value={c.code}>
              {c.title} ({c.code})
            </option>
          ))}
        </select>
        <input
          className="input-base font-mono"
          placeholder="rubitime_branch_id"
          value={rubitimeBranchId}
          onChange={(e) => setRubitimeBranchId(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base col-span-2"
          placeholder="Название филиала"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base col-span-2"
          placeholder="Адрес (необязательно)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isPending}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={save} disabled={isPending}>
        {isPending ? "Сохранение..." : "Сохранить филиал"}
      </Button>
    </div>
  );
}

function ServiceForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [priceMinor, setPriceMinor] = useState("400000");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function save() {
    setErr(null);
    if (!title.trim()) {
      setErr("Название обязательно");
      return;
    }
    const dur = Number.parseInt(durationMinutes, 10);
    const price = Number.parseInt(priceMinor, 10);
    if (!Number.isFinite(dur) || dur <= 0) {
      setErr("Длительность должна быть > 0");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setErr("Цена (копейки) должна быть >= 0");
      return;
    }
    start(async () => {
      const res = await apiJson<{ ok: boolean; error?: string }>(`${BASE}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          durationMinutes: dur,
          priceMinor: price,
        }),
      });
      if (!res.ok) {
        setErr(String(res.error ?? "Ошибка"));
        return;
      }
      setTitle("");
      setDescription("");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить услугу</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input-base col-span-2"
          placeholder="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base"
          placeholder="Длительность (мин)"
          type="number"
          min={1}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base"
          placeholder="Цена (копейки)"
          type="number"
          min={0}
          value={priceMinor}
          onChange={(e) => setPriceMinor(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base col-span-2"
          placeholder="Описание (необязательно)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={save} disabled={isPending}>
        {isPending ? "Сохранение..." : "Сохранить услугу"}
      </Button>
    </div>
  );
}

function SpecialistForm({
  branches,
  onDone,
}: {
  branches: CatalogBranch[];
  onDone: () => void;
}) {
  const [branchId, setBranchId] = useState("");
  const [fullName, setFullName] = useState("");
  const [description, setDescription] = useState("");
  const [rubitimeCooperatorId, setRubitimeCooperatorId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function save() {
    setErr(null);
    const br = branches.find((b) => b.id === branchId);
    if (!br) {
      setErr("Выберите филиал");
      return;
    }
    if (!fullName.trim() || !rubitimeCooperatorId.trim()) {
      setErr("ФИО и Rubitime Cooperator ID обязательны");
      return;
    }
    start(async () => {
      const res = await apiJson<{ ok: boolean; error?: string }>(`${BASE}/specialists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rubitimeBranchId: br.rubitimeBranchId,
          fullName: fullName.trim(),
          description: description.trim() || null,
          rubitimeCooperatorId: rubitimeCooperatorId.trim(),
        }),
      });
      if (!res.ok) {
        setErr(String(res.error ?? "Ошибка"));
        return;
      }
      setFullName("");
      setDescription("");
      setRubitimeCooperatorId("");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить специалиста</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="input-base col-span-2"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          disabled={isPending}
        >
          <option value="">— филиал —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} · rubitime {b.rubitimeBranchId}
            </option>
          ))}
        </select>
        <input
          className="input-base font-mono"
          placeholder="rubitime_cooperator_id"
          value={rubitimeCooperatorId}
          onChange={(e) => setRubitimeCooperatorId(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base"
          placeholder="ФИО"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={isPending}
        />
        <input
          className="input-base col-span-2"
          placeholder="Описание (необязательно)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={save} disabled={isPending}>
        {isPending ? "Сохранение..." : "Сохранить специалиста"}
      </Button>
    </div>
  );
}

function BranchServiceForm({
  branches,
  services,
  specialists,
  onDone,
}: {
  branches: CatalogBranch[];
  services: CatalogService[];
  specialists: CatalogSpecialist[];
  onDone: () => void;
}) {
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [rubitimeServiceId, setRubitimeServiceId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  const specForBranch = specialists.filter((s) => s.branchId === branchId);

  function save() {
    setErr(null);
    if (!branchId || !serviceId || !specialistId || !rubitimeServiceId.trim()) {
      setErr("Все поля обязательны");
      return;
    }
    start(async () => {
      const res = await apiJson<{ ok: boolean; error?: string }>(`${BASE}/branch-services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          serviceId,
          specialistId,
          rubitimeServiceId: rubitimeServiceId.trim(),
        }),
      });
      if (!res.ok) {
        setErr(String(res.error ?? "Ошибка"));
        return;
      }
      setRubitimeServiceId("");
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить связку филиал — услуга</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          className="input-base col-span-2"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setSpecialistId("");
          }}
          disabled={isPending}
        >
          <option value="">— филиал —</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <select
          className="input-base col-span-2"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          disabled={isPending}
        >
          <option value="">— услуга —</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} ({s.durationMinutes} мин)
            </option>
          ))}
        </select>
        <select
          className="input-base col-span-2"
          value={specialistId}
          onChange={(e) => setSpecialistId(e.target.value)}
          disabled={isPending}
        >
          <option value="">— специалист (филиал) —</option>
          {specForBranch.map((s) => (
            <option key={s.id} value={s.id}>
              {s.fullName} · {s.rubitimeCooperatorId}
            </option>
          ))}
        </select>
        <input
          className="input-base col-span-2 font-mono"
          placeholder="rubitime_service_id"
          value={rubitimeServiceId}
          onChange={(e) => setRubitimeServiceId(e.target.value)}
          disabled={isPending}
        />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={save} disabled={isPending}>
        {isPending ? "Сохранение..." : "Сохранить связку"}
      </Button>
    </div>
  );
}
