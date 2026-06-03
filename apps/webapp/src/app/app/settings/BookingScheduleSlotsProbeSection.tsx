"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const OVERVIEW = "/api/admin/booking-engine/overview";
const CALENDAR = "/api/admin/booking-engine/calendar";

type ServiceRow = { id: string; title: string };

async function readJsonSafe<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function BookingScheduleSlotsProbeSection() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadServices = useCallback(async () => {
    try {
      const res = await fetch(OVERVIEW);
      const json = await readJsonSafe<{ ok?: boolean; services?: ServiceRow[] }>(res);
      if (json?.ok && json.services) {
        setServices(json.services);
        if (json.services[0]) setServiceId((prev) => prev || json.services![0]!.id);
      }
    } catch {
      setError("overview_load_failed");
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadServices();
    });
  }, [loadServices]);

  const serviceLabel = services.find((s) => s.id === serviceId)?.title;

  function probe() {
    if (!serviceId || !date) return;
    setError(null);
    startTransition(async () => {
      try {
        const qs = new URLSearchParams({
          view: "day",
          date,
          serviceId,
          includeFreeSlots: "1",
        });
        const res = await fetch(`${CALENDAR}?${qs.toString()}`);
        const json = await readJsonSafe<{
          ok?: boolean;
          error?: string;
          events?: Array<{ kind: string; startAt: string; endAt: string }>;
        }>(res);
        if (!json || !json.ok) {
          setError(json?.error ?? `probe_failed_${res.status}`);
          setSlots([]);
          return;
        }
        const freeSlots = (json.events ?? []).filter((event) => event.kind === "freeSlot");
        setSlots(
          freeSlots.map((s) => {
            const start = new Date(s.startAt);
            return start.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" });
          }),
        );
      } catch {
        setError("probe_failed");
        setSlots([]);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Проверка слотов</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Услуга</Label>
            <Select value={serviceId} onValueChange={(v) => v && setServiceId(v)}>
              <SelectTrigger displayLabel={serviceLabel} className="w-full max-w-md" />
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Дата</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-md" />
          </div>
        </div>
        <Button type="button" size="sm" disabled={pending} onClick={probe}>
          Показать свободные слоты
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {slots.length > 0 ? (
          <p className="text-sm text-muted-foreground">Слоты: {slots.join(", ")}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
