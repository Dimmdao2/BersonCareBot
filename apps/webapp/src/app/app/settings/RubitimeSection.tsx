"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Branch = {
  id: number;
  rubitimeBranchId: number;
  cityCode: string;
  title: string;
  address: string;
  isActive: boolean;
};

type Service = {
  id: number;
  rubitimeServiceId: number;
  title: string;
  categoryCode: string;
  durationMinutes: number;
  isActive: boolean;
};

type Cooperator = {
  id: number;
  rubitimeCooperatorId: number;
  title: string;
  isActive: boolean;
};

type BookingProfile = {
  id: number;
  bookingType: "online" | "in_person";
  categoryCode: string;
  cityCode: string | null;
  isActive: boolean;
  rubitimeBranchId: number;
  rubitimeServiceId: number;
  rubitimeCooperatorId: number;
  durationMinutes: number;
  branchTitle: string;
  serviceTitle: string;
  cooperatorTitle: string;
};

async function apiFetch(url: string) {
  const res = await fetch(url);
  return res.json() as Promise<Record<string, unknown>>;
}

async function apiPost(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

async function apiDelete(url: string) {
  const res = await fetch(url, { method: "DELETE" });
  return res.json() as Promise<Record<string, unknown>>;
}

// ---- Sub-form: add branch ----

function AddBranchForm({ onDone }: { onDone: () => void }) {
  const [rubitimeBranchId, setRubitimeBranchId] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleSave() {
    setErr(null);
    const idNum = parseInt(rubitimeBranchId, 10);
    if (!Number.isFinite(idNum) || idNum <= 0) { setErr("Rubitime Branch ID должен быть положительным числом"); return; }
    if (!cityCode.trim()) { setErr("Код города обязателен"); return; }
    if (!title.trim()) { setErr("Название обязательно"); return; }
    start(async () => {
      const res = await apiPost("/api/admin/rubitime/branches", { rubitimeBranchId: idNum, cityCode: cityCode.trim(), title: title.trim(), address: address.trim() });
      if (!res.ok) { setErr(String(res.error ?? "Ошибка")); return; }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить филиал</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="input-base" placeholder="Rubitime Branch ID (число)" value={rubitimeBranchId} onChange={(e) => setRubitimeBranchId(e.target.value)} disabled={isPending} />
        <input className="input-base" placeholder="Код города (moscow, spb...)" value={cityCode} onChange={(e) => setCityCode(e.target.value)} disabled={isPending} />
        <input className="input-base col-span-2" placeholder="Название (напр. Москва — Рубинштейна)" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
        <input className="input-base col-span-2" placeholder="Адрес (необязательно)" value={address} onChange={(e) => setAddress(e.target.value)} disabled={isPending} />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={handleSave} disabled={isPending}>{isPending ? "Сохранение..." : "Сохранить филиал"}</Button>
    </div>
  );
}

// ---- Sub-form: add service ----

function AddServiceForm({ onDone }: { onDone: () => void }) {
  const [rubitimeServiceId, setRubitimeServiceId] = useState("");
  const [title, setTitle] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleSave() {
    setErr(null);
    const idNum = parseInt(rubitimeServiceId, 10);
    const dur = parseInt(durationMinutes, 10);
    if (!Number.isFinite(idNum) || idNum <= 0) { setErr("Rubitime Service ID должен быть числом"); return; }
    if (!title.trim()) { setErr("Название обязательно"); return; }
    if (!categoryCode.trim()) { setErr("Код категории обязателен"); return; }
    if (!Number.isFinite(dur) || dur <= 0) { setErr("Длительность должна быть > 0"); return; }
    start(async () => {
      const res = await apiPost("/api/admin/rubitime/services", { rubitimeServiceId: idNum, title: title.trim(), categoryCode: categoryCode.trim(), durationMinutes: dur });
      if (!res.ok) { setErr(String(res.error ?? "Ошибка")); return; }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить услугу</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="input-base" placeholder="Rubitime Service ID (число)" value={rubitimeServiceId} onChange={(e) => setRubitimeServiceId(e.target.value)} disabled={isPending} />
        <input className="input-base" placeholder="Код категории (general, rehab_lfk...)" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} disabled={isPending} />
        <input className="input-base col-span-2" placeholder="Название услуги" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
        <input className="input-base" placeholder="Длительность (мин)" type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} disabled={isPending} />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={handleSave} disabled={isPending}>{isPending ? "Сохранение..." : "Сохранить услугу"}</Button>
    </div>
  );
}

// ---- Sub-form: add cooperator ----

function AddCooperatorForm({ onDone }: { onDone: () => void }) {
  const [rubitimeCooperatorId, setRubitimeCooperatorId] = useState("");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleSave() {
    setErr(null);
    const idNum = parseInt(rubitimeCooperatorId, 10);
    if (!Number.isFinite(idNum) || idNum <= 0) { setErr("Rubitime Cooperator ID должен быть числом"); return; }
    if (!title.trim()) { setErr("Название обязательно"); return; }
    start(async () => {
      const res = await apiPost("/api/admin/rubitime/cooperators", { rubitimeCooperatorId: idNum, title: title.trim() });
      if (!res.ok) { setErr(String(res.error ?? "Ошибка")); return; }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить специалиста</p>
      <div className="grid grid-cols-2 gap-2">
        <input className="input-base" placeholder="Rubitime Cooperator ID (число)" value={rubitimeCooperatorId} onChange={(e) => setRubitimeCooperatorId(e.target.value)} disabled={isPending} />
        <input className="input-base" placeholder="ФИО / название" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} />
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={handleSave} disabled={isPending}>{isPending ? "Сохранение..." : "Сохранить специалиста"}</Button>
    </div>
  );
}

// ---- Sub-form: add booking profile ----

function AddProfileForm({ branches, services, cooperators, onDone }: {
  branches: Branch[];
  services: Service[];
  cooperators: Cooperator[];
  onDone: () => void;
}) {
  const [bookingType, setBookingType] = useState<"online" | "in_person">("online");
  const [categoryCode, setCategoryCode] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [cooperatorId, setCooperatorId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleSave() {
    setErr(null);
    const bId = parseInt(branchId, 10);
    const sId = parseInt(serviceId, 10);
    const cId = parseInt(cooperatorId, 10);
    if (!categoryCode.trim()) { setErr("Код категории обязателен"); return; }
    if (!Number.isFinite(bId)) { setErr("Выберите филиал"); return; }
    if (!Number.isFinite(sId)) { setErr("Выберите услугу"); return; }
    if (!Number.isFinite(cId)) { setErr("Выберите специалиста"); return; }
    const body = {
      bookingType,
      categoryCode: categoryCode.trim(),
      cityCode: bookingType === "in_person" && cityCode.trim() ? cityCode.trim() : null,
      branchId: bId,
      serviceId: sId,
      cooperatorId: cId,
    };
    start(async () => {
      const res = await apiPost("/api/admin/rubitime/booking-profiles", body);
      if (!res.ok) { setErr(String(res.error ?? "Ошибка")); return; }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Добавить / обновить профиль записи</p>
      <div className="grid grid-cols-2 gap-2">
        <select className="input-base" value={bookingType} onChange={(e) => setBookingType(e.target.value as "online" | "in_person")} disabled={isPending}>
          <option value="online">online</option>
          <option value="in_person">in_person</option>
        </select>
        <input className="input-base" placeholder="Код категории (general, rehab_lfk...)" value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} disabled={isPending} />
        {bookingType === "in_person" && (
          <input className="input-base col-span-2" placeholder="Код города (moscow, spb...)" value={cityCode} onChange={(e) => setCityCode(e.target.value)} disabled={isPending} />
        )}
        <select className="input-base" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={isPending}>
          <option value="">— выберите филиал —</option>
          {branches.filter((b) => b.isActive).map((b) => (
            <option key={b.id} value={b.id}>{b.title} ({b.cityCode})</option>
          ))}
        </select>
        <select className="input-base" value={serviceId} onChange={(e) => setServiceId(e.target.value)} disabled={isPending}>
          <option value="">— выберите услугу —</option>
          {services.filter((s) => s.isActive).map((s) => (
            <option key={s.id} value={s.id}>{s.title} ({s.durationMinutes}мин)</option>
          ))}
        </select>
        <select className="input-base col-span-2" value={cooperatorId} onChange={(e) => setCooperatorId(e.target.value)} disabled={isPending}>
          <option value="">— выберите специалиста —</option>
          {cooperators.filter((c) => c.isActive).map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button size="sm" onClick={handleSave} disabled={isPending}>{isPending ? "Сохранение..." : "Сохранить профиль"}</Button>
    </div>
  );
}

// ---- Main component ----

export function RubitimeSection() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [cooperators, setCooperators] = useState<Cooperator[]>([]);
  const [profiles, setProfiles] = useState<BookingProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  async function loadAll() {
    setLoading(true);
    setLoadError(null);
    try {
      const [branchRes, serviceRes, cooperatorRes, profileRes] = await Promise.all([
        apiFetch("/api/admin/rubitime/branches"),
        apiFetch("/api/admin/rubitime/services"),
        apiFetch("/api/admin/rubitime/cooperators"),
        apiFetch("/api/admin/rubitime/booking-profiles"),
      ]);
      if (Array.isArray(branchRes.branches)) setBranches(branchRes.branches as Branch[]);
      if (Array.isArray(serviceRes.services)) setServices(serviceRes.services as Service[]);
      if (Array.isArray(cooperatorRes.cooperators)) setCooperators(cooperatorRes.cooperators as Cooperator[]);
      if (Array.isArray(profileRes.profiles)) setProfiles(profileRes.profiles as BookingProfile[]);
    } catch {
      setLoadError("Не удалось загрузить данные из integrator");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  function handleDelete(type: "branch" | "service" | "cooperator" | "profile", id: number) {
    const urls: Record<typeof type, string> = {
      branch: `/api/admin/rubitime/branches/${id}`,
      service: `/api/admin/rubitime/services/${id}`,
      cooperator: `/api/admin/rubitime/cooperators/${id}`,
      profile: `/api/admin/rubitime/booking-profiles/${id}`,
    };
    start(async () => {
      await apiDelete(urls[type]);
      await loadAll();
    });
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Rubitime — профили записи</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
          {loading ? "Загрузка..." : "Обновить"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {loadError && (
          <p className="text-sm text-destructive">{loadError}</p>
        )}

        {/* Booking Profiles — главное */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Профили записи (тип / категория / город → Rubitime IDs)</p>
          {profiles.length === 0 && !loading && (
            <p className="text-xs text-muted-foreground">Нет активных профилей. Добавьте хотя бы один ниже.</p>
          )}
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex flex-col">
                <span className="font-mono font-medium">
                  {p.bookingType} / {p.categoryCode}
                  {p.cityCode ? ` / ${p.cityCode}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  br:{p.rubitimeBranchId} ({p.branchTitle}) · svc:{p.rubitimeServiceId} ({p.serviceTitle}, {p.durationMinutes}м) · coop:{p.rubitimeCooperatorId} ({p.cooperatorTitle})
                </span>
              </div>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete("profile", p.id)} disabled={isPending}>
                ✕
              </Button>
            </div>
          ))}
          <AddProfileForm branches={branches} services={services} cooperators={cooperators} onDone={() => void loadAll()} />
        </div>

        {/* Branches */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Филиалы</p>
          {branches.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
              <span>
                <span className="font-mono font-medium">#{b.rubitimeBranchId}</span>
                {" "}{b.title} · {b.cityCode}{b.address ? ` · ${b.address}` : ""}
                {!b.isActive && <span className="ml-1 text-muted-foreground">(неактивен)</span>}
              </span>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete("branch", b.id)} disabled={isPending}>
                ✕
              </Button>
            </div>
          ))}
          <AddBranchForm onDone={() => void loadAll()} />
        </div>

        {/* Services */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Услуги</p>
          {services.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
              <span>
                <span className="font-mono font-medium">#{s.rubitimeServiceId}</span>
                {" "}{s.title} · {s.categoryCode} · {s.durationMinutes}мин
                {!s.isActive && <span className="ml-1 text-muted-foreground">(неактивна)</span>}
              </span>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete("service", s.id)} disabled={isPending}>
                ✕
              </Button>
            </div>
          ))}
          <AddServiceForm onDone={() => void loadAll()} />
        </div>

        {/* Cooperators */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Специалисты</p>
          {cooperators.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
              <span>
                <span className="font-mono font-medium">#{c.rubitimeCooperatorId}</span>
                {" "}{c.title}
                {!c.isActive && <span className="ml-1 text-muted-foreground">(неактивен)</span>}
              </span>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete("cooperator", c.id)} disabled={isPending}>
                ✕
              </Button>
            </div>
          ))}
          <AddCooperatorForm onDone={() => void loadAll()} />
        </div>
      </CardContent>
    </Card>
  );
}
