"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const BASE = "/api/admin/booking-engine/policies";

type CancelPolicy = {
  id: string;
  scopeLevel: string;
  title: string;
  freeCancelHoursBefore: number;
  cancellationAllowed: boolean;
  maxSelfReschedules?: never;
};

type ReschedulePolicy = {
  id: string;
  scopeLevel: string;
  title: string;
  selfRescheduleHoursBefore: number;
  maxSelfReschedules: number;
};

export function BookingPoliciesSection() {
  const [cancelPolicy, setCancelPolicy] = useState<CancelPolicy | null>(null);
  const [reschedulePolicy, setReschedulePolicy] = useState<ReschedulePolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const res = await fetch(BASE);
    const json = (await res.json()) as {
      ok?: boolean;
      cancellationPolicies?: CancelPolicy[];
      reschedulePolicies?: ReschedulePolicy[];
      error?: string;
    };
    if (!json.ok) {
      setError(json.error ?? "load_failed");
      return;
    }
    const orgCancel = json.cancellationPolicies?.find((p) => p.scopeLevel === "organization") ?? null;
    const orgReschedule = json.reschedulePolicies?.find((p) => p.scopeLevel === "organization") ?? null;
    setCancelPolicy(orgCancel);
    setReschedulePolicy(orgReschedule);
    setError(null);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function saveCancellation() {
    if (!cancelPolicy) return;
    startTransition(async () => {
      await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "cancellation",
          id: cancelPolicy.id,
          scopeLevel: "organization",
          title: cancelPolicy.title,
          isActive: true,
          freeCancelHoursBefore: cancelPolicy.freeCancelHoursBefore,
          cancellationAllowed: cancelPolicy.cancellationAllowed,
          lateCancellationBehavior: "manual_review",
          refundPrepaymentOnLate: "manual",
          chargePackageSessionOnLate: false,
          requiresStaffConfirmation: false,
          notifyPatient: true,
          notifyStaff: true,
          sortOrder: 0,
        }),
      });
      await load();
    });
  }

  function saveReschedule() {
    if (!reschedulePolicy) return;
    startTransition(async () => {
      await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "reschedule",
          id: reschedulePolicy.id,
          scopeLevel: "organization",
          title: reschedulePolicy.title,
          isActive: true,
          selfRescheduleHoursBefore: reschedulePolicy.selfRescheduleHoursBefore,
          maxSelfReschedules: reschedulePolicy.maxSelfReschedules,
          allowDifferentBranch: false,
          allowDifferentCity: false,
          allowDifferentSpecialist: false,
          allowDifferentService: false,
          limitExceededBehavior: "manual_request",
          requiresStaffConfirmation: false,
          notifyPatient: true,
          notifyStaff: true,
          sortOrder: 0,
        }),
      });
      await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Политики отмены и переноса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {cancelPolicy ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Бесплатная отмена, часов до приёма</Label>
              <Input
                type="number"
                min={0}
                value={cancelPolicy.freeCancelHoursBefore}
                onChange={(e) =>
                  setCancelPolicy({ ...cancelPolicy, freeCancelHoursBefore: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={cancelPolicy.cancellationAllowed}
                onCheckedChange={(v) => setCancelPolicy({ ...cancelPolicy, cancellationAllowed: v })}
              />
              <Label>Отмена разрешена</Label>
            </div>
            <Button type="button" disabled={pending} onClick={saveCancellation}>
              Сохранить отмену
            </Button>
          </div>
        ) : null}
        {reschedulePolicy ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Самостоятельный перенос, часов до приёма</Label>
              <Input
                type="number"
                min={0}
                value={reschedulePolicy.selfRescheduleHoursBefore}
                onChange={(e) =>
                  setReschedulePolicy({
                    ...reschedulePolicy,
                    selfRescheduleHoursBefore: Number(e.target.value) || 0,
                  })
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
                  setReschedulePolicy({
                    ...reschedulePolicy,
                    maxSelfReschedules: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <Button type="button" disabled={pending} onClick={saveReschedule}>
              Сохранить перенос
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
