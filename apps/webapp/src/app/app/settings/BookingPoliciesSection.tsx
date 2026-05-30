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
import type {
  CancellationPolicy,
  LateCancellationBehavior,
  PolicyScopeLevel,
  RescheduleLimitBehavior,
  ReschedulePolicy,
} from "@/modules/booking-policies/types";

const BASE = "/api/admin/booking-engine/policies";

const SCOPE_LEVELS: { value: PolicyScopeLevel; label: string }[] = [
  { value: "organization", label: "Клиника" },
  { value: "specialist", label: "Специалист" },
  { value: "service", label: "Услуга" },
  { value: "product", label: "Продукт" },
];

const LATE_CANCEL_OPTIONS: { value: LateCancellationBehavior; label: string }[] = [
  { value: "manual_review", label: "Ручное решение" },
  { value: "penalty", label: "Штраф" },
  { value: "charge_package", label: "Списание абонемента" },
  { value: "retain_prepayment", label: "Удержать предоплату" },
  { value: "refund_prepayment", label: "Вернуть предоплату" },
];

const LIMIT_OPTIONS: { value: RescheduleLimitBehavior; label: string }[] = [
  { value: "manual_request", label: "Запрос персоналу" },
  { value: "deny", label: "Запретить" },
];

type PolicyKind = "cancellation" | "reschedule";

const OVERVIEW = "/api/admin/booking-engine/overview";
const PRODUCTS = "/api/admin/booking-engine/products";

type Props = {
  defaultKind?: PolicyKind;
  /** Скрыть переключатель «тип политики» (вкладки правил). */
  lockKind?: boolean;
};

export function BookingPoliciesSection({ defaultKind = "cancellation", lockKind = false }: Props) {
  const [cancellationPolicies, setCancellationPolicies] = useState<CancellationPolicy[]>([]);
  const [reschedulePolicies, setReschedulePolicies] = useState<ReschedulePolicy[]>([]);
  const [scopeLevel, setScopeLevel] = useState<PolicyScopeLevel>("organization");
  const [scopeEntityId, setScopeEntityId] = useState("");
  const [kind, setKind] = useState<PolicyKind>(defaultKind);
  const [specialists, setSpecialists] = useState<Array<{ id: string; fullName: string }>>([]);
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; title: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch(BASE);
    const json = (await res.json()) as {
      ok?: boolean;
      cancellationPolicies?: CancellationPolicy[];
      reschedulePolicies?: ReschedulePolicy[];
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? "load_failed");
      return;
    }
    setCancellationPolicies(json.cancellationPolicies ?? []);
    setReschedulePolicies(json.reschedulePolicies ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    setKind(defaultKind);
  }, [defaultKind]);

  useEffect(() => {
    void (async () => {
      const [ovRes, prodRes] = await Promise.all([fetch(OVERVIEW), fetch(PRODUCTS)]);
      const ov = (await ovRes.json()) as {
        ok?: boolean;
        specialists?: Array<{ id: string; fullName: string }>;
        services?: Array<{ id: string; title: string }>;
      };
      const prod = (await prodRes.json()) as {
        ok?: boolean;
        products?: Array<{ id: string; title: string }>;
      };
      if (ov.ok) {
        setSpecialists(ov.specialists ?? []);
        setServices(ov.services ?? []);
      }
      if (prod.ok && prod.products) setProducts(prod.products);
    })();
  }, []);

  const cancelPolicy =
    cancellationPolicies.find(
      (p) =>
        p.scopeLevel === scopeLevel &&
        (scopeLevel === "organization" || (p.scopeEntityId ?? "") === scopeEntityId.trim()),
    ) ?? null;

  const reschedulePolicy =
    reschedulePolicies.find(
      (p) =>
        p.scopeLevel === scopeLevel &&
        (scopeLevel === "organization" || (p.scopeEntityId ?? "") === scopeEntityId.trim()),
    ) ?? null;

  const activePolicy = kind === "cancellation" ? cancelPolicy : reschedulePolicy;

  function saveCancellation(policy: CancellationPolicy) {
    startTransition(async () => {
      await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "cancellation",
          id: policy.id,
          scopeLevel: policy.scopeLevel,
          scopeEntityId: policy.scopeLevel === "organization" ? null : policy.scopeEntityId,
          title: policy.title,
          isActive: policy.isActive,
          freeCancelHoursBefore: policy.freeCancelHoursBefore,
          cancellationAllowed: policy.cancellationAllowed,
          lateCancellationBehavior: policy.lateCancellationBehavior,
          refundPrepaymentOnLate: policy.refundPrepaymentOnLate,
          chargePackageSessionOnLate: policy.chargePackageSessionOnLate,
          requiresStaffConfirmation: policy.requiresStaffConfirmation,
          notifyPatient: policy.notifyPatient,
          notifyStaff: policy.notifyStaff,
          sortOrder: policy.sortOrder,
        }),
      });
      await load();
    });
  }

  function saveReschedule(policy: ReschedulePolicy) {
    startTransition(async () => {
      await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "reschedule",
          id: policy.id,
          scopeLevel: policy.scopeLevel,
          scopeEntityId: policy.scopeLevel === "organization" ? null : policy.scopeEntityId,
          title: policy.title,
          isActive: policy.isActive,
          selfRescheduleHoursBefore: policy.selfRescheduleHoursBefore,
          maxSelfReschedules: policy.maxSelfReschedules,
          allowDifferentBranch: policy.allowDifferentBranch,
          allowDifferentCity: policy.allowDifferentCity,
          allowDifferentSpecialist: policy.allowDifferentSpecialist,
          allowDifferentService: policy.allowDifferentService,
          limitExceededBehavior: policy.limitExceededBehavior,
          requiresStaffConfirmation: policy.requiresStaffConfirmation,
          notifyPatient: policy.notifyPatient,
          notifyStaff: policy.notifyStaff,
          sortOrder: policy.sortOrder,
        }),
      });
      await load();
    });
  }

  const scopeLabel = SCOPE_LEVELS.find((s) => s.value === scopeLevel)?.label ?? scopeLevel;
  const kindLabel = kind === "cancellation" ? "Отмена" : "Перенос";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Политики отмены и переноса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Уровень</Label>
            <Select value={scopeLevel} onValueChange={(v) => v && setScopeLevel(v as PolicyScopeLevel)}>
              <SelectTrigger displayLabel={scopeLabel} className="w-full" />
              <SelectContent>
                {SCOPE_LEVELS.map((s) => (
                  <SelectItem key={s.value} value={s.value} label={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {scopeLevel === "specialist" ? (
            <div className="space-y-2">
              <Label>Специалист</Label>
              <Select value={scopeEntityId} onValueChange={(v) => v && setScopeEntityId(v)}>
                <SelectTrigger
                  displayLabel={specialists.find((s) => s.id === scopeEntityId)?.fullName}
                  className="w-full max-w-md"
                />
                <SelectContent>
                  {specialists.map((s) => (
                    <SelectItem key={s.id} value={s.id} label={s.fullName}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {scopeLevel === "service" ? (
            <div className="space-y-2">
              <Label>Услуга</Label>
              <Select value={scopeEntityId} onValueChange={(v) => v && setScopeEntityId(v)}>
                <SelectTrigger
                  displayLabel={services.find((s) => s.id === scopeEntityId)?.title}
                  className="w-full max-w-md"
                />
                <SelectContent>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id} label={s.title}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {scopeLevel === "product" ? (
            <div className="space-y-2">
              <Label>Продукт</Label>
              <Select value={scopeEntityId} onValueChange={(v) => v && setScopeEntityId(v)}>
                <SelectTrigger
                  displayLabel={products.find((p) => p.id === scopeEntityId)?.title}
                  className="w-full max-w-md"
                />
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id} label={p.title}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {!lockKind ? (
            <div className="space-y-2">
              <Label>Тип политики</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as PolicyKind)}>
                <SelectTrigger displayLabel={kindLabel} className="w-full max-w-md" />
                <SelectContent>
                  <SelectItem value="cancellation" label="Отмена">
                    Отмена
                  </SelectItem>
                  <SelectItem value="reschedule" label="Перенос">
                    Перенос
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        {kind === "cancellation" && cancelPolicy ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Бесплатная отмена, часов</Label>
              <Input
                type="number"
                min={0}
                value={cancelPolicy.freeCancelHoursBefore}
                onChange={(e) =>
                  setCancellationPolicies((prev) =>
                    prev.map((p) =>
                      p.id === cancelPolicy.id
                        ? { ...p, freeCancelHoursBefore: Number(e.target.value) || 0 }
                        : p,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Поздняя отмена</Label>
              <Select
                value={cancelPolicy.lateCancellationBehavior}
                onValueChange={(v) =>
                  v &&
                  setCancellationPolicies((prev) =>
                    prev.map((p) =>
                      p.id === cancelPolicy.id
                        ? { ...p, lateCancellationBehavior: v as LateCancellationBehavior }
                        : p,
                    ),
                  )
                }
              >
                <SelectTrigger
                  displayLabel={
                    LATE_CANCEL_OPTIONS.find((o) => o.value === cancelPolicy.lateCancellationBehavior)?.label
                  }
                  className="w-full"
                />
                <SelectContent>
                  {LATE_CANCEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} label={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={cancelPolicy.cancellationAllowed}
                onCheckedChange={(v) =>
                  setCancellationPolicies((prev) =>
                    prev.map((p) => (p.id === cancelPolicy.id ? { ...p, cancellationAllowed: v } : p)),
                  )
                }
              />
              <Label>Отмена разрешена</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={cancelPolicy.notifyPatient}
                onCheckedChange={(v) =>
                  setCancellationPolicies((prev) =>
                    prev.map((p) => (p.id === cancelPolicy.id ? { ...p, notifyPatient: v } : p)),
                  )
                }
              />
              <Label>Уведомлять пациента</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={cancelPolicy.notifyStaff}
                onCheckedChange={(v) =>
                  setCancellationPolicies((prev) =>
                    prev.map((p) => (p.id === cancelPolicy.id ? { ...p, notifyStaff: v } : p)),
                  )
                }
              />
              <Label>Уведомлять персонал</Label>
            </div>
            <Button type="button" disabled={pending} onClick={() => saveCancellation(cancelPolicy)}>
              Сохранить отмену
            </Button>
          </div>
        ) : null}

        {kind === "reschedule" && reschedulePolicy ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Самостоятельный перенос, часов</Label>
              <Input
                type="number"
                min={0}
                value={reschedulePolicy.selfRescheduleHoursBefore}
                onChange={(e) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) =>
                      p.id === reschedulePolicy.id
                        ? { ...p, selfRescheduleHoursBefore: Number(e.target.value) || 0 }
                        : p,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Лимит переносов</Label>
              <Input
                type="number"
                min={0}
                value={reschedulePolicy.maxSelfReschedules}
                onChange={(e) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) =>
                      p.id === reschedulePolicy.id
                        ? { ...p, maxSelfReschedules: Number(e.target.value) || 0 }
                        : p,
                    ),
                  )
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>При превышении лимита</Label>
              <Select
                value={reschedulePolicy.limitExceededBehavior}
                onValueChange={(v) =>
                  v &&
                  setReschedulePolicies((prev) =>
                    prev.map((p) =>
                      p.id === reschedulePolicy.id
                        ? { ...p, limitExceededBehavior: v as RescheduleLimitBehavior }
                        : p,
                    ),
                  )
                }
              >
                <SelectTrigger
                  displayLabel={
                    LIMIT_OPTIONS.find((o) => o.value === reschedulePolicy.limitExceededBehavior)?.label
                  }
                  className="w-full"
                />
                <SelectContent>
                  {LIMIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} label={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={reschedulePolicy.allowDifferentBranch}
                onCheckedChange={(v) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) => (p.id === reschedulePolicy.id ? { ...p, allowDifferentBranch: v } : p)),
                  )
                }
              />
              <Label>Другой филиал</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={reschedulePolicy.allowDifferentCity}
                onCheckedChange={(v) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) => (p.id === reschedulePolicy.id ? { ...p, allowDifferentCity: v } : p)),
                  )
                }
              />
              <Label>Другой город</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={reschedulePolicy.allowDifferentSpecialist}
                onCheckedChange={(v) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) =>
                      p.id === reschedulePolicy.id ? { ...p, allowDifferentSpecialist: v } : p,
                    ),
                  )
                }
              />
              <Label>Другой специалист</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={reschedulePolicy.allowDifferentService}
                onCheckedChange={(v) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) => (p.id === reschedulePolicy.id ? { ...p, allowDifferentService: v } : p)),
                  )
                }
              />
              <Label>Другая услуга</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={reschedulePolicy.notifyPatient}
                onCheckedChange={(v) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) => (p.id === reschedulePolicy.id ? { ...p, notifyPatient: v } : p)),
                  )
                }
              />
              <Label>Уведомлять пациента</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={reschedulePolicy.notifyStaff}
                onCheckedChange={(v) =>
                  setReschedulePolicies((prev) =>
                    prev.map((p) => (p.id === reschedulePolicy.id ? { ...p, notifyStaff: v } : p)),
                  )
                }
              />
              <Label>Уведомлять персонал</Label>
            </div>
            <Button type="button" disabled={pending} onClick={() => saveReschedule(reschedulePolicy)}>
              Сохранить перенос
            </Button>
          </div>
        ) : null}

        {!activePolicy ? (
          <p className="text-sm text-muted-foreground">Нет политики для выбранного уровня.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
