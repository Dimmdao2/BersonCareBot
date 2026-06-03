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

type BranchRow = { id: string; title: string; isActive: boolean };
type ServiceRow = { id: string; title: string; isActive: boolean };

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
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch(OVERVIEW);
      const json = await readJsonSafe<{ ok?: boolean; branches?: BranchRow[]; services?: ServiceRow[] }>(res);
      if (json?.ok && json.branches && json.services) {
        const activeBranches = json.branches.filter((b) => b.isActive);
        const activeServices = json.services.filter((s) => s.isActive);
        setBranches(activeBranches);
        setServices(activeServices);
        if (activeBranches[0]) setBranchId((prev) => prev || activeBranches[0]!.id);
        if (activeServices[0]) setServiceId((prev) => prev || activeServices[0]!.id);
      }
    } catch {
      setError("overview_load_failed");
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadCatalog();
    });
  }, [loadCatalog]);

  const branchLabel = branches.find((b) => b.id === branchId)?.title;
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
        if (branchId) qs.set("branchId", branchId);
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
        <CardTitle className="text-base">Проверка записи глазами пациента</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Локация</Label>
            <Select value={branchId} onValueChange={(v) => v && setBranchId(v)}>
              <SelectTrigger displayLabel={branchLabel} className="w-full max-w-md" />
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.title}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Услуга</Label>
            <Select value={serviceId} onValueChange={(v) => v && setServiceId(v)}>
              <SelectTrigger displayLabel={serviceLabel} className="w-full max-w-md" />
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.title}>
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
