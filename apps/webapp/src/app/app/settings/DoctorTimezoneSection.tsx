"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";
import {
  getCachedIanaTimezonesSorted,
  isValidIanaTimeZoneId,
  prioritizeMoscowFirst,
} from "@/shared/timezone/ianaTimezonesForAdminUi";

export type DoctorTimezoneSectionProps = {
  initialTimezone: string | null;
};

export function DoctorTimezoneSection({ initialTimezone }: DoctorTimezoneSectionProps) {
  const [timezone, setTimezone] = useState(initialTimezone ?? "Europe/Moscow");
  const [tzFilter, setTzFilter] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const baseIanaIds = useMemo(() => {
    const all = getCachedIanaTimezonesSorted();
    const cur = timezone.trim() || "Europe/Moscow";
    if (all.includes(cur)) return all;
    return [cur, ...all];
  }, [timezone]);

  const filteredIanaIds = useMemo(() => {
    const cur = timezone.trim() || "Europe/Moscow";
    const q = tzFilter.trim().toLowerCase();
    if (q) {
      return baseIanaIds.filter((z) => z.toLowerCase().includes(q));
    }
    const list = prioritizeMoscowFirst(baseIanaIds);
    if (!list.includes(cur)) return [cur, ...list];
    return list;
  }, [baseIanaIds, tzFilter, timezone]);

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const tzRaw = timezone.trim() || "Europe/Moscow";
        if (!isValidIanaTimeZoneId(tzRaw)) {
          setError("Выберите валидную зону IANA из списка");
          return;
        }
        const res = await fetch("/api/doctor/account/timezone", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone: tzRaw }),
        });
        if (!res.ok) {
          setError("Не удалось сохранить часовой пояс");
          return;
        }
        setSaved(true);
      } catch {
        setError("Ошибка при сохранении");
      }
    });
  }

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Часовой пояс</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input
          type="search"
          placeholder="Поиск по названию зоны…"
          value={tzFilter}
          onChange={(e) => setTzFilter(e.target.value)}
          disabled={isPending}
          autoComplete="off"
          className="max-w-lg"
        />
        <Select
          value={timezone.trim() || "Europe/Moscow"}
          onValueChange={(v) => {
            if (v) {
              setTimezone(v);
              setTzFilter("");
            }
          }}
          disabled={isPending}
        >
          <SelectTrigger id="doctor-calendar-timezone" className="w-full max-w-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {filteredIanaIds.length > 0 ? (
              filteredIanaIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))
            ) : (
              <div className="px-2 py-2 text-xs text-muted-foreground">Нет результатов</div>
            )}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Найдено зон: {filteredIanaIds.length}</span>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleSave} disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          {saved && <span className="text-sm text-green-600">Сохранено</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
