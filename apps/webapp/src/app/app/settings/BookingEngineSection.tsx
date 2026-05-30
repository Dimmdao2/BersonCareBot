"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookingEngineBranchList,
  BookingEngineRoomList,
  BookingEngineServiceList,
  BookingEngineSpecialistList,
} from "./BookingEngineCatalogLists";

const BASE = "/api/admin/booking-engine";

type DoctorAppointmentsReadSource = "rubitime_legacy" | "canonical";
type BookingSlotsReadSource = "rubitime" | "canonical";

type Overview = {
  organizationId: string;
  bridgeEnabled: boolean;
  doctorAppointmentsReadSource: DoctorAppointmentsReadSource;
  bookingSlotsReadSource: BookingSlotsReadSource;
  calendarReadSource: DoctorAppointmentsReadSource;
  organization: { id: string; title: string } | null;
  branches: { id: string; title: string; cityCode: string; isActive: boolean }[];
  rooms: { id: string; branchId: string; title: string; isActive: boolean }[];
  specialists: { id: string; fullName: string; isActive: boolean }[];
  services: {
    id: string;
    title: string;
    durationMinutes: number;
    priceMinor: number;
    publicWidgetVisible: boolean;
    adminManualOnly: boolean;
    isActive: boolean;
  }[];
  specialistAvailability: {
    id: string;
    specialistId: string;
    serviceId: string;
    branchId: string | null;
  }[];
  locationAvailability: { id: string; serviceId: string; branchId: string }[];
  specialistRooms: { id: string; specialistId: string; roomId: string; isActive: boolean }[];
  mapping: {
    branches: number;
    specialists: number;
    services: number;
    availabilities: number;
    appointments: number;
  };
};

async function apiJson<T extends { ok?: boolean; error?: string; message?: string }>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "invalid_json" : `http_${res.status}`);
  }
  if (!res.ok || body.ok === false) {
    const detail = typeof body.message === "string" ? body.message : body.error;
    throw new Error(detail ?? `http_${res.status}`);
  }
  return body;
}

const READ_SOURCE_ITEMS: { value: DoctorAppointmentsReadSource; label: string }[] = [
  { value: "rubitime_legacy", label: "Rubitime" },
  { value: "canonical", label: "Канон" },
];

const SLOTS_READ_SOURCE_ITEMS: { value: BookingSlotsReadSource; label: string }[] = [
  { value: "rubitime", label: "Rubitime" },
  { value: "canonical", label: "Канон" },
];

export function BookingEngineSection() {
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [isPending, start] = useTransition();

  const [orgTitle, setOrgTitle] = useState("");
  const [branchTitle, setBranchTitle] = useState("");
  const [branchCity, setBranchCity] = useState("msk");
  const [roomBranchId, setRoomBranchId] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [specialistName, setSpecialistName] = useState("");
  const [specialistBranchId, setSpecialistBranchId] = useState("");
  const [serviceTitle, setServiceTitle] = useState("");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [servicePrice, setServicePrice] = useState("500000");
  const [availSpecialistId, setAvailSpecialistId] = useState("");
  const [availServiceId, setAvailServiceId] = useState("");
  const [availBranchId, setAvailBranchId] = useState("");
  const [availCityCode, setAvailCityCode] = useState("");
  const [availRoomId, setAvailRoomId] = useState("");
  const [servicePublicWidget, setServicePublicWidget] = useState(true);
  const [serviceManualOnly, setServiceManualOnly] = useState(false);
  const [linkSpecId, setLinkSpecId] = useState("");
  const [linkRoomId, setLinkRoomId] = useState("");
  const [locServiceId, setLocServiceId] = useState("");
  const [locBranchId, setLocBranchId] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    const httpRes = await fetch(`${BASE}/overview`);
    const text = await httpRes.text();
    let res: { ok?: boolean; error?: string; message?: string } & Partial<Overview>;
    try {
      res = JSON.parse(text) as typeof res;
    } catch {
      setLoadError(httpRes.ok ? "invalid_json" : `http_${httpRes.status}`);
      return;
    }
    if (!httpRes.ok || res.ok === false) {
      if (res.error === "booking_engine_unavailable") {
        setUnavailable(true);
        return;
      }
      setLoadError(res.error ?? res.message ?? `http_${httpRes.status}`);
      return;
    }
    setData({
      ...(res as Overview),
      doctorAppointmentsReadSource:
        res.doctorAppointmentsReadSource === "canonical" ? "canonical" : "rubitime_legacy",
      bookingSlotsReadSource: res.bookingSlotsReadSource === "rubitime" ? "rubitime" : "canonical",
    });
    setOrgTitle(res.organization?.title ?? "");
    if (res.branches?.[0]) {
      setRoomBranchId((prev) => prev || res.branches![0]!.id);
      setSpecialistBranchId((prev) => prev || res.branches![0]!.id);
      setAvailBranchId((prev) => prev || res.branches![0]!.id);
    }
    if (res.specialists?.[0]) setAvailSpecialistId((prev) => prev || res.specialists![0]!.id);
    if (res.services?.[0]) {
      setAvailServiceId((prev) => prev || res.services![0]!.id);
      setLocServiceId((prev) => prev || res.services![0]!.id);
    }
    if (res.specialists?.[0]) setLinkSpecId((prev) => prev || res.specialists![0]!.id);
    if (res.rooms?.[0]) setLinkRoomId((prev) => prev || res.rooms![0]!.id);
    if (res.branches?.[0]) setLocBranchId((prev) => prev || res.branches![0]!.id);
  }, []);

  useEffect(() => {
    start(() => {
      void load();
    });
  }, [load, start]);

  const run = (fn: () => Promise<void>) => {
    start(async () => {
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "action_failed");
      }
    });
  };

  const catalogReload = useCallback(async () => {
    await load();
  }, [load]);

  if (unavailable) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Каноническая модель записи</CardTitle>
        </CardHeader>
        <CardContent>Недоступно без подключения к БД.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Каноническая модель записи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadError && <p className="text-sm text-destructive">{loadError}</p>}
        {actionError && <p className="text-sm text-destructive">{actionError}</p>}

        {data && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <Label>Список записей врача</Label>
                <Select
                  value={data.doctorAppointmentsReadSource}
                  disabled={isPending}
                  onValueChange={(value) =>
                    run(async () => {
                      const res = await apiJson<{ ok: boolean }>("/api/admin/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          key: "booking_doctor_appointments_read_source",
                          value,
                        }),
                      });
                      if (!res.ok) throw new Error("read_source_save_failed");
                    })
                  }
                >
                  <SelectTrigger
                    className="w-[10rem]"
                    displayLabel={
                      READ_SOURCE_ITEMS.find((i) => i.value === data.doctorAppointmentsReadSource)?.label
                    }
                  />
                  <SelectContent>
                    {READ_SOURCE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Свободные слоты пациента</Label>
                <Select
                  value={data.bookingSlotsReadSource}
                  disabled={isPending}
                  onValueChange={(value) =>
                    run(async () => {
                      const res = await apiJson<{ ok: boolean }>("/api/admin/settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          key: "booking_slots_read_source",
                          value,
                        }),
                      });
                      if (!res.ok) throw new Error("slots_read_source_save_failed");
                    })
                  }
                >
                  <SelectTrigger
                    className="w-[10rem]"
                    displayLabel={
                      SLOTS_READ_SOURCE_ITEMS.find((i) => i.value === data.bookingSlotsReadSource)?.label
                    }
                  />
                  <SelectContent>
                    {SLOTS_READ_SOURCE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                Календарь сейчас:{" "}
                {data.calendarReadSource === "canonical" ? "Канон" : "Rubitime"}
              </p>
              {data.doctorAppointmentsReadSource === "rubitime_legacy" &&
              data.bookingSlotsReadSource === "canonical" ? (
                <p className="text-sm text-destructive">Источники расходятся</p>
              ) : null}
              {data.doctorAppointmentsReadSource === "canonical" &&
              data.bookingSlotsReadSource === "rubitime" ? (
                <p className="text-sm text-destructive">Источники расходятся</p>
              ) : null}
              <div className="flex items-center gap-2">
                <Switch
                  checked={data.bridgeEnabled}
                  disabled={isPending}
                  onCheckedChange={(enabled) =>
                    run(async () => {
                      const res = await apiJson<{ ok: boolean }>(`${BASE}/bridge`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled }),
                      });
                      if (!res.ok) throw new Error("bridge_toggle_failed");
                    })
                  }
                />
                <span className="text-sm">Rubitime-мост</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending || !data.bridgeEnabled}
                onClick={() =>
                  run(async () => {
                    await apiJson<{ ok: boolean }>(`${BASE}/bridge`, { method: "POST" });
                  })
                }
              >
                Проецировать записи
              </Button>
              <span className="text-sm text-muted-foreground">
                маппинг: филиалы {data.mapping.branches}, специалисты {data.mapping.specialists}, услуги{" "}
                {data.mapping.services}, доступность {data.mapping.availabilities}, записи{" "}
                {data.mapping.appointments}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Организация</Label>
                <div className="flex gap-2">
                  <Input value={orgTitle} onChange={(e) => setOrgTitle(e.target.value)} />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/organizations`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ title: orgTitle }),
                        });
                        if (!res.ok) throw new Error("org_save_failed");
                      })
                    }
                  >
                    Сохранить
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Филиал</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[8rem] flex-1"
                    placeholder="Название"
                    value={branchTitle}
                    onChange={(e) => setBranchTitle(e.target.value)}
                  />
                  <Input
                    className="w-24"
                    placeholder="Город"
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/branches`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ title: branchTitle, cityCode: branchCity }),
                        });
                        if (!res.ok) throw new Error("branch_save_failed");
                        setBranchTitle("");
                      })
                    }
                  >
                    Добавить
                  </Button>
                </div>
                <BookingEngineBranchList
                  branches={data.branches}
                  isPending={isPending}
                  onChanged={catalogReload}
                  onError={setActionError}
                />
              </div>

              <div className="space-y-2">
                <Label>Кабинет</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={roomBranchId} onValueChange={(v) => v && setRoomBranchId(v)}>
                    <SelectTrigger className="w-[10rem]" displayLabel={data.branches.find((b) => b.id === roomBranchId)?.title}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.branches.map((b) => (
                        <SelectItem key={b.id} value={b.id} label={b.title}>
                          {b.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="min-w-[8rem] flex-1"
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending || !roomBranchId}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/rooms`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ branchId: roomBranchId, title: roomTitle }),
                        });
                        if (!res.ok) throw new Error("room_save_failed");
                        setRoomTitle("");
                      })
                    }
                  >
                    Добавить
                  </Button>
                </div>
                <BookingEngineRoomList
                  rooms={data.rooms}
                  isPending={isPending}
                  onChanged={catalogReload}
                  onError={setActionError}
                />
              </div>

              <div className="space-y-2">
                <Label>Специалист</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[8rem] flex-1"
                    value={specialistName}
                    onChange={(e) => setSpecialistName(e.target.value)}
                  />
                  <Select value={specialistBranchId} onValueChange={(v) => v && setSpecialistBranchId(v)}>
                    <SelectTrigger className="w-[10rem]" displayLabel={data.branches.find((b) => b.id === specialistBranchId)?.title}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.branches.map((b) => (
                        <SelectItem key={b.id} value={b.id} label={b.title}>
                          {b.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/specialists`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            fullName: specialistName,
                            branchId: specialistBranchId || undefined,
                          }),
                        });
                        if (!res.ok) throw new Error("specialist_save_failed");
                        setSpecialistName("");
                      })
                    }
                  >
                    Добавить
                  </Button>
                </div>
                <BookingEngineSpecialistList
                  specialists={data.specialists}
                  isPending={isPending}
                  onChanged={catalogReload}
                  onError={setActionError}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Услуга</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[10rem] flex-1"
                    value={serviceTitle}
                    onChange={(e) => setServiceTitle(e.target.value)}
                  />
                  <Input
                    className="w-20"
                    type="number"
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(e.target.value)}
                  />
                  <Input
                    className="w-28"
                    type="number"
                    value={servicePrice}
                    onChange={(e) => setServicePrice(e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={servicePublicWidget} onCheckedChange={setServicePublicWidget} />
                    Публичная запись
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Switch checked={serviceManualOnly} onCheckedChange={setServiceManualOnly} />
                    Только вручную
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/services`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            title: serviceTitle,
                            durationMinutes: Number(serviceDuration),
                            priceMinor: Number(servicePrice),
                            publicWidgetVisible: servicePublicWidget,
                            adminManualOnly: serviceManualOnly,
                          }),
                        });
                        if (!res.ok) throw new Error("service_save_failed");
                        setServiceTitle("");
                      })
                    }
                  >
                    Добавить
                  </Button>
                </div>
                <BookingEngineServiceList
                  services={data.services}
                  isPending={isPending}
                  onChanged={catalogReload}
                  onError={setActionError}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Специалист × кабинет</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={linkSpecId} onValueChange={(v) => v && setLinkSpecId(v)}>
                    <SelectTrigger
                      className="w-[10rem]"
                      displayLabel={data.specialists.find((s) => s.id === linkSpecId)?.fullName}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.specialists.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.fullName}>
                          {s.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={linkRoomId} onValueChange={(v) => v && setLinkRoomId(v)}>
                    <SelectTrigger
                      className="w-[10rem]"
                      displayLabel={data.rooms.find((r) => r.id === linkRoomId)?.title}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id} label={r.title}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending || !linkSpecId || !linkRoomId}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/specialist-rooms`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ specialistId: linkSpecId, roomId: linkRoomId }),
                        });
                        if (!res.ok) throw new Error("specialist_room_failed");
                      })
                    }
                  >
                    Связать
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Связей: {data.specialistRooms.length}
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Услуга × филиал</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={locServiceId} onValueChange={(v) => v && setLocServiceId(v)}>
                    <SelectTrigger
                      className="w-[10rem]"
                      displayLabel={data.services.find((s) => s.id === locServiceId)?.title}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.services.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.title}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={locBranchId} onValueChange={(v) => v && setLocBranchId(v)}>
                    <SelectTrigger
                      className="w-[10rem]"
                      displayLabel={data.branches.find((b) => b.id === locBranchId)?.title}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.branches.map((b) => (
                        <SelectItem key={b.id} value={b.id} label={b.title}>
                          {b.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending || !locServiceId || !locBranchId}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/availability`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            kind: "service_location",
                            serviceId: locServiceId,
                            branchId: locBranchId,
                          }),
                        });
                        if (!res.ok) throw new Error("location_availability_failed");
                      })
                    }
                  >
                    Связать
                  </Button>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Доступность специалист × услуга × филиал × город × кабинет</Label>
                <div className="flex flex-wrap gap-2">
                  <Select value={availSpecialistId} onValueChange={(v) => v && setAvailSpecialistId(v)}>
                    <SelectTrigger className="w-[10rem]" displayLabel={data.specialists.find((s) => s.id === availSpecialistId)?.fullName}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.specialists.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.fullName}>
                          {s.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={availServiceId} onValueChange={(v) => v && setAvailServiceId(v)}>
                    <SelectTrigger className="w-[10rem]" displayLabel={data.services.find((s) => s.id === availServiceId)?.title}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.services.map((s) => (
                        <SelectItem key={s.id} value={s.id} label={s.title}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={availBranchId} onValueChange={(v) => v && setAvailBranchId(v)}>
                    <SelectTrigger className="w-[10rem]" displayLabel={data.branches.find((b) => b.id === availBranchId)?.title}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.branches.map((b) => (
                        <SelectItem key={b.id} value={b.id} label={b.title}>
                          {b.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-24"
                    placeholder="Город"
                    value={availCityCode}
                    onChange={(e) => setAvailCityCode(e.target.value)}
                  />
                  <Select
                    value={availRoomId || "__none__"}
                    onValueChange={(v) => setAvailRoomId(!v || v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger
                      className="w-[10rem]"
                      displayLabel={
                        availRoomId
                          ? data.rooms.find((r) => r.id === availRoomId)?.title
                          : "—"
                      }
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" label="—">
                        —
                      </SelectItem>
                      {data.rooms.map((r) => (
                        <SelectItem key={r.id} value={r.id} label={r.title}>
                          {r.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending || !availSpecialistId || !availServiceId}
                    onClick={() =>
                      run(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/availability`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            kind: "specialist_service",
                            specialistId: availSpecialistId,
                            serviceId: availServiceId,
                            branchId: availBranchId || null,
                            cityCode: availCityCode.trim() || null,
                            roomId: availRoomId || null,
                          }),
                        });
                        if (!res.ok) throw new Error("availability_save_failed");
                      })
                    }
                  >
                    Связать
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Связей: {data.specialistAvailability.length} специалист×услуга,{" "}
                  {data.locationAvailability.length} услуга×филиал
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
