"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
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

const POLICY_API = "/api/admin/booking-engine/prepayment-policies";
const SERVICES_API = "/api/admin/booking-engine/services";

type ServiceRow = { id: string; title: string };
type PolicyRow = {
  serviceId: string | null;
  onlineCategory: string | null;
  mode: "disabled" | "fixed_minor" | "percent" | "full_price";
  amountMinor: number | null;
  percentBps: number | null;
};

const MODE_LABELS: Record<PolicyRow["mode"], string> = {
  disabled: "Отключена",
  fixed_minor: "Фикс (коп.)",
  percent: "Процент",
  full_price: "Полная цена",
};

const ONLINE_CATEGORIES = [
  { value: "rehab_lfk", label: "Реабилитация" },
  { value: "nutrition", label: "Нутрициология" },
  { value: "general", label: "Общее" },
] as const;

export function BookingPrepaymentSection() {
  const [scope, setScope] = useState<"service" | "online">("service");
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [onlineCategory, setOnlineCategory] = useState<(typeof ONLINE_CATEGORIES)[number]["value"]>("general");
  const [mode, setMode] = useState<PolicyRow["mode"]>("disabled");
  const [amountMinor, setAmountMinor] = useState("");
  const [percentBps, setPercentBps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const [svcRes, polRes] = await Promise.all([fetch(SERVICES_API), fetch(POLICY_API)]);
    const svcJson = (await svcRes.json()) as { ok?: boolean; services?: ServiceRow[] };
    const polJson = (await polRes.json()) as { ok?: boolean; policies?: PolicyRow[] };
    if (svcJson.ok && svcJson.services) setServices(svcJson.services);
    if (polJson.ok && polJson.policies) {
      setPolicies(
        polJson.policies.map((p) => ({
          serviceId: p.serviceId,
          onlineCategory: p.onlineCategory,
          mode: p.mode,
          amountMinor: p.amountMinor,
          percentBps: p.percentBps,
        })),
      );
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load, startTransition]);

  const selectedService = services.find((s) => s.id === serviceId);
  const serviceDisplayLabel = selectedService?.title ?? "";
  const onlineDisplayLabel = ONLINE_CATEGORIES.find((c) => c.value === onlineCategory)?.label ?? "";

  function applyService(id: string) {
    setServiceId(id);
    const p = policies.find((x) => x.serviceId === id);
    if (p) {
      setMode(p.mode);
      setAmountMinor(p.amountMinor != null ? String(p.amountMinor) : "");
      setPercentBps(p.percentBps != null ? String(p.percentBps / 100) : "");
    } else {
      setMode("disabled");
      setAmountMinor("");
      setPercentBps("");
    }
  }

  function applyOnline(cat: (typeof ONLINE_CATEGORIES)[number]["value"]) {
    setOnlineCategory(cat);
    const p = policies.find((x) => x.onlineCategory === cat);
    if (p) {
      setMode(p.mode);
      setAmountMinor(p.amountMinor != null ? String(p.amountMinor) : "");
      setPercentBps(p.percentBps != null ? String(p.percentBps / 100) : "");
    } else {
      setMode("disabled");
      setAmountMinor("");
      setPercentBps("");
    }
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const body =
        scope === "service"
          ? {
              scope: "service" as const,
              serviceId,
              mode,
              amountMinor: amountMinor.trim() ? Number.parseInt(amountMinor, 10) : null,
              percentBps: percentBps.trim() ? Math.round(Number.parseFloat(percentBps) * 100) : null,
              isActive: mode !== "disabled",
            }
          : {
              scope: "online" as const,
              onlineCategory,
              mode,
              amountMinor: amountMinor.trim() ? Number.parseInt(amountMinor, 10) : null,
              percentBps: percentBps.trim() ? Math.round(Number.parseFloat(percentBps) * 100) : null,
              isActive: mode !== "disabled",
            };
      if (scope === "service" && !serviceId) return;
      const res = await fetch(POLICY_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "save_failed");
        return;
      }
      await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Предоплата</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select
          value={scope}
          onValueChange={(v) => {
            const next = v === "online" ? "online" : "service";
            setScope(next);
            if (next === "online") {
              applyOnline(onlineCategory);
            } else if (serviceId) {
              applyService(serviceId);
            } else if (services[0]) {
              applyService(services[0].id);
            }
          }}
        >
          <SelectTrigger
            displayLabel={scope === "service" ? "Очный приём (услуга)" : "Онлайн"}
            className="w-full"
          />
          <SelectContent>
            <SelectItem value="service">Очный приём (услуга)</SelectItem>
            <SelectItem value="online">Онлайн</SelectItem>
          </SelectContent>
        </Select>
        {scope === "service" ? (
          <div className="space-y-2">
            <Label>Услуга</Label>
            <Select
              value={serviceId}
              onValueChange={(id) => {
                if (id) applyService(id);
              }}
            >
              <SelectTrigger displayLabel={serviceDisplayLabel || undefined} className="w-full" />
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Категория</Label>
            <Select
              value={onlineCategory}
              onValueChange={(v) => {
                if (v === "rehab_lfk" || v === "nutrition" || v === "general") applyOnline(v);
              }}
            >
              <SelectTrigger displayLabel={onlineDisplayLabel} className="w-full" />
              <SelectContent>
                {ONLINE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Режим</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as PolicyRow["mode"])}>
            <SelectTrigger displayLabel={MODE_LABELS[mode]} className="w-full" />
            <SelectContent>
              {(Object.keys(MODE_LABELS) as PolicyRow["mode"][]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {mode === "fixed_minor" ? (
          <div className="space-y-2">
            <Label>Сумма (коп.)</Label>
            <Input value={amountMinor} onChange={(e) => setAmountMinor(e.target.value)} inputMode="numeric" />
          </div>
        ) : null}
        {mode === "percent" ? (
          <div className="space-y-2">
            <Label>Процент</Label>
            <Input value={percentBps} onChange={(e) => setPercentBps(e.target.value)} inputMode="decimal" />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="button"
          disabled={pending || (scope === "service" && !serviceId)}
          onClick={save}
        >
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
