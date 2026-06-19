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
} from "@/shared/ui/doctor/primitives/select";
import { apiJson } from "@/shared/lib/apiJson";
import {
  ensureDefaultSpecialist,
  fetchSoloOverview,
  minuteToTimeLabel,
  timeLabelToMinute,
} from "@/app/app/settings/bookingSoloAdminApi";

const WH_BASE = "/api/admin/booking-engine/working-hours";
const SETTINGS_BASE = "/api/admin/booking-engine/scheduling-settings";

const WEEKDAYS = [
  { value: 1, label: "Понедельник", short: "Пн" },
  { value: 2, label: "Вторник", short: "Вт" },
  { value: 3, label: "Среда", short: "Ср" },
  { value: 4, label: "Четверг", short: "Чт" },
  { value: 5, label: "Пятница", short: "Пт" },
  { value: 6, label: "Суббота", short: "Сб" },
  { value: 0, label: "Воскресенье", short: "Вс" },
] as const;

const BUFFER_PRESETS = [0, 10, 15, 30] as const;

type HourRow = {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  isActive: boolean;
};

export function BookingSoloScheduleSection() {
  const [branches, setBranches] = useState<{ id: string; title: string; isActive: boolean }[]>([]);
  const [branchId, setBranchId] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [rows, setRows] = useState<HourRow[]>([]);
  const [usesFallback, setUsesFallback] = useState(false);
  const [bufferMinutes, setBufferMinutes] = useState(0);
  const [minNoticeHours, setMinNoticeHours] = useState(0);
  const [customBuffer, setCustomBuffer] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [addWeekday, setAddWeekday] = useState("1");
  const [addStart, setAddStart] = useState("09:00");
  const [addEnd, setAddEnd] = useState("18:00");
  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [copyFromWeekday, setCopyFromWeekday] = useState<number | null>(null);
  const [copyTargets, setCopyTargets] = useState<number[]>([]);

  const branchLabel = branches.find((b) => b.id === branchId)?.title;

  const rowsByWeekday = useMemo(() => {
    const map = new Map<number, HourRow[]>();
    for (const wd of WEEKDAYS) map.set(wd.value, []);
    for (const row of rows.filter((r) => r.isActive)) {
      const list = map.get(row.weekday) ?? [];
      list.push(row);
      map.set(row.weekday, list);
    }
    for (const [k, list] of map) {
      list.sort((a, b) => a.startMinute - b.startMinute);
      map.set(k, list);
    }
    return map;
  }, [rows]);

  const loadHours = useCallback(async (specId: string, brId: string) => {
    const qs = new URLSearchParams();
    if (specId) qs.set("specialistId", specId);
    if (brId) qs.set("branchId", brId);
    const json = await apiJson<{ ok: boolean; rows: HourRow[]; usesFallback?: boolean }>(`${WH_BASE}?${qs.toString()}`);
    setRows(json.rows);
    setUsesFallback(json.usesFallback === true);
  }, []);

  const loadSettings = useCallback(async (specId: string) => {
    const qs = specId ? `?specialistId=${encodeURIComponent(specId)}` : "";
    const json = await apiJson<{ ok: boolean; bufferMinutes: number; minNoticeHours: number }>(
      `${SETTINGS_BASE}${qs}`,
    );
    setBufferMinutes(json.bufferMinutes);
    setMinNoticeHours(json.minNoticeHours);
    if (!BUFFER_PRESETS.includes(json.bufferMinutes as (typeof BUFFER_PRESETS)[number])) {
      setCustomBuffer(String(json.bufferMinutes));
    } else {
      setCustomBuffer("");
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setLoadError(null);
    const overview = await fetchSoloOverview();
    if (!overview) throw new Error("booking_engine_unavailable");
    const activeBranches = overview.branches.filter((b) => b.isActive);
    setBranches(activeBranches);
    const specId = await ensureDefaultSpecialist(overview.organization?.title);
    setSpecialistId(specId);
    const brId = activeBranches[0]?.id ?? "";
    setBranchId(brId);
    await loadSettings(specId);
  }, [loadSettings]);

  useEffect(() => {
    startTransition(() => {
      void bootstrap().catch((e) => setLoadError(e instanceof Error ? e.message : "load_failed"));
    });
  }, [bootstrap]);

  useEffect(() => {
    if (!specialistId || !branchId) return;
    startTransition(() => {
      void loadHours(specialistId, branchId).catch((e) =>
        setLoadError(e instanceof Error ? e.message : "hours_load_failed"),
      );
    });
  }, [branchId, specialistId, loadHours]);

  function run(fn: () => Promise<void>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await fn();
        if (specialistId && branchId) await loadHours(specialistId, branchId);
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "action_failed");
      }
    });
  }

  function saveSettings(nextBuffer: number, nextNotice: number) {
    run(async () => {
      await apiJson(SETTINGS_BASE, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specialistId,
          bufferMinutes: nextBuffer,
          minNoticeHours: nextNotice,
        }),
      });
      await loadSettings(specialistId);
    });
  }

  function copyDay() {
    if (copyFromWeekday == null || copyTargets.length === 0) return;
    const source = rowsByWeekday.get(copyFromWeekday) ?? [];
    run(async () => {
      for (const targetWd of copyTargets) {
        const existing = rows.filter((r) => r.weekday === targetWd && r.isActive);
        for (const row of existing) {
          await apiJson(`${WH_BASE}?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
        }
        for (const interval of source) {
          await apiJson(WH_BASE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              weekday: targetWd,
              startMinute: interval.startMinute,
              endMinute: interval.endMinute,
              specialistId,
              branchId,
            }),
          });
        }
      }
      setCopyFromWeekday(null);
      setCopyTargets([]);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Рабочее расписание</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Локация</Label>
            <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
              <SelectTrigger className="w-[14rem]" displayLabel={branchLabel} />
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.title}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {usesFallback ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Расписание не настроено — используется временный режим 09:00–18:00.
          </p>
        ) : null}

        <div className="space-y-3">
          {WEEKDAYS.map((wd) => {
            const dayRows = rowsByWeekday.get(wd.value) ?? [];
            return (
              <div key={wd.value} className="rounded-md border border-border/60 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{wd.label}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    disabled={pending || dayRows.length === 0}
                    onClick={() => {
                      setCopyFromWeekday(wd.value);
                      setCopyTargets([]);
                    }}
                  >
                    Копировать…
                  </Button>
                </div>
                {dayRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Выходной</p>
                ) : (
                  <ul className="space-y-1">
                    {dayRows.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
                        {editId === row.id ? (
                          <>
                            <Input
                              type="time"
                              className="h-8 w-28"
                              value={editStart}
                              onChange={(e) => setEditStart(e.target.value)}
                            />
                            <span>—</span>
                            <Input
                              type="time"
                              className="h-8 w-28"
                              value={editEnd}
                              onChange={(e) => setEditEnd(e.target.value)}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2"
                              disabled={pending}
                              onClick={() =>
                                run(async () => {
                                  await apiJson(WH_BASE, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      id: row.id,
                                      startMinute: timeLabelToMinute(editStart),
                                      endMinute: timeLabelToMinute(editEnd),
                                    }),
                                  });
                                  setEditId(null);
                                })
                              }
                            >
                              OK
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => setEditId(null)}
                            >
                              ×
                            </Button>
                          </>
                        ) : (
                          <>
                            <span>
                              {minuteToTimeLabel(row.startMinute)} — {minuteToTimeLabel(row.endMinute)}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={pending}
                              onClick={() => {
                                setEditId(row.id);
                                setEditStart(minuteToTimeLabel(row.startMinute));
                                setEditEnd(minuteToTimeLabel(row.endMinute));
                              }}
                            >
                              Изм.
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              disabled={pending}
                              onClick={() =>
                                run(async () => {
                                  await apiJson(`${WH_BASE}?id=${encodeURIComponent(row.id)}`, {
                                    method: "DELETE",
                                  });
                                })
                              }
                            >
                              Отключить
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {copyFromWeekday != null ? (
          <div className="rounded-md border border-dashed p-3 space-y-2">
            <p className="text-sm font-medium">
              Копировать {WEEKDAYS.find((w) => w.value === copyFromWeekday)?.label} на:
            </p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.filter((w) => w.value !== copyFromWeekday).map((w) => {
                const checked = copyTargets.includes(w.value);
                return (
                  <label key={w.value} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCopyTargets((prev) =>
                          checked ? prev.filter((v) => v !== w.value) : [...prev, w.value],
                        )
                      }
                    />
                    {w.short}
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={pending || copyTargets.length === 0} onClick={copyDay}>
                Применить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCopyFromWeekday(null);
                  setCopyTargets([]);
                }}
              >
                Отмена
              </Button>
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <Label>Добавить интервал</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={addWeekday} onValueChange={(v) => v && setAddWeekday(v)}>
              <SelectTrigger
                className="w-[10rem]"
                displayLabel={WEEKDAYS.find((w) => String(w.value) === addWeekday)?.short}
              />
              <SelectContent>
                {WEEKDAYS.map((w) => (
                  <SelectItem key={w.value} value={String(w.value)} label={w.label}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="time" className="h-8 w-28" value={addStart} onChange={(e) => setAddStart(e.target.value)} />
            <Input type="time" className="h-8 w-28" value={addEnd} onChange={(e) => setAddEnd(e.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={pending || !branchId}
              onClick={() =>
                run(async () => {
                  await apiJson(WH_BASE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      weekday: Number(addWeekday),
                      startMinute: timeLabelToMinute(addStart),
                      endMinute: timeLabelToMinute(addEnd),
                      specialistId,
                      branchId,
                    }),
                  });
                })
              }
            >
              Добавить
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <Label>Буфер между приёмами</Label>
            <div className="flex flex-wrap gap-2">
              {BUFFER_PRESETS.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={bufferMinutes === m && !customBuffer ? "default" : "outline"}
                  disabled={pending}
                  onClick={() => saveSettings(m, minNoticeHours)}
                >
                  {m === 0 ? "0" : `${m} мин`}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Input
                className="h-8 w-20"
                type="number"
                min={0}
                max={240}
                placeholder="мин"
                value={customBuffer}
                onChange={(e) => setCustomBuffer(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending || !customBuffer.trim()}
                onClick={() => saveSettings(Number(customBuffer), minNoticeHours)}
              >
                Свой
              </Button>
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <Label>Минимум до записи (часы)</Label>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-24"
                type="number"
                min={0}
                max={168}
                value={minNoticeHours}
                onChange={(e) => setMinNoticeHours(Number(e.target.value) || 0)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => saveSettings(bufferMinutes, minNoticeHours)}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
