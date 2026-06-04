"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";

const BASE = "/api/admin/booking-engine/working-hours";
const OVERVIEW = "/api/admin/booking-engine/overview";

const WEEKDAYS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Вс" },
];

type Row = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  isActive: boolean;
};

type Catalog = {
  specialists: { id: string; fullName: string }[];
  branches: { id: string; title: string }[];
  rooms: { id: string; title: string }[];
};

function minuteToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeToMinute(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export function BookingWorkingHoursSection({ soloUx = false }: { soloUx?: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [usesFallback, setUsesFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [specialistId, setSpecialistId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("");
  const [roomId, setRoomId] = useState<string>("");
  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  const specialistLabel = useMemo(
    () => catalog?.specialists.find((s) => s.id === specialistId)?.fullName,
    [catalog, specialistId],
  );
  const branchLabel = useMemo(
    () => catalog?.branches.find((b) => b.id === branchId)?.title,
    [catalog, branchId],
  );
  const roomLabel = useMemo(() => catalog?.rooms.find((r) => r.id === roomId)?.title, [catalog, roomId]);

  const loadCatalog = useCallback(async () => {
    const res = await fetch(OVERVIEW);
    const json = (await res.json()) as {
      ok?: boolean;
      specialists?: Catalog["specialists"];
      branches?: Catalog["branches"];
      rooms?: Catalog["rooms"];
    };
    if (json.ok && json.specialists && json.branches && json.rooms) {
      setCatalog({ specialists: json.specialists, branches: json.branches, rooms: json.rooms });
      if (soloUx && json.specialists[0]) {
        setSpecialistId(json.specialists[0].id);
      }
      if (soloUx && json.branches[0]) {
        setBranchId((prev) => prev || json.branches![0]!.id);
      }
    }
  }, [soloUx]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (specialistId) qs.set("specialistId", specialistId);
    if (branchId) qs.set("branchId", branchId);
    if (roomId) qs.set("roomId", roomId);
    const res = await fetch(`${BASE}?${qs.toString()}`);
    const json = (await res.json()) as {
      ok?: boolean;
      rows?: Row[];
      usesFallback?: boolean;
      error?: string;
    };
    if (!json.ok || !json.rows) {
      setError(json.error ?? "load_failed");
      return;
    }
    setRows(json.rows.filter((r) => r.isActive));
    setUsesFallback(json.usesFallback === true);
    setError(null);
  }, [branchId, roomId, specialistId]);

  useEffect(() => {
    startTransition(() => {
      void loadCatalog();
    });
  }, [loadCatalog]);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function createRow() {
    startTransition(async () => {
      const res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekday: Number(weekday),
          startMinute: timeToMinute(startTime),
          endMinute: timeToMinute(endTime),
          specialistId: specialistId || null,
          branchId: branchId || null,
          roomId: roomId || null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!json.ok) {
        setError("create_failed");
        return;
      }
      await load();
    });
  }

  function deactivate(id: string) {
    startTransition(async () => {
      await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Рабочие часы</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {usesFallback ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Расписание не настроено — используется временный режим 09:00–18:00.
          </p>
        ) : null}
        <div className={soloUx ? "grid gap-3 sm:grid-cols-1" : "grid gap-3 sm:grid-cols-3"}>
          {!soloUx ? (
          <div className="flex flex-col gap-1">
            <Label>Специалист</Label>
            <Select value={specialistId || "__none__"} onValueChange={(v) => setSpecialistId(!v || v === "__none__" ? "" : v)}>
              <SelectTrigger displayLabel={specialistId ? specialistLabel : "Вся клиника"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Вся клиника">
                  Вся клиника
                </SelectItem>
                {(catalog?.specialists ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.fullName}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label>{soloUx ? "Локация" : "Филиал"}</Label>
            <Select value={branchId || "__none__"} onValueChange={(v) => setBranchId(!v || v === "__none__" ? "" : v)}>
              <SelectTrigger displayLabel={branchId ? branchLabel : "Все"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.title}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!soloUx ? (
          <div className="flex flex-col gap-1">
            <Label>Кабинет</Label>
            <Select value={roomId || "__none__"} onValueChange={(v) => setRoomId(!v || v === "__none__" ? "" : v)}>
              <SelectTrigger displayLabel={roomId ? roomLabel : "Все"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.rooms ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id} label={r.title}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label>День</Label>
            <Select value={weekday} onValueChange={(v) => setWeekday(v ?? "1")}>
              <SelectTrigger displayLabel={WEEKDAYS.find((d) => String(d.value) === weekday)?.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d.value} value={String(d.value)} label={d.label}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex flex-col gap-1">
            <Label>Начало</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Конец</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <Button type="button" onClick={createRow} disabled={pending}>
          Добавить
        </Button>
        <ul className="space-y-2 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <span>
                {WEEKDAYS.find((d) => d.value === r.weekday)?.label ?? r.weekday} · {minuteToTime(r.startMinute)} —{" "}
                {minuteToTime(r.endMinute)}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => deactivate(r.id)} disabled={pending}>
                Отключить
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
