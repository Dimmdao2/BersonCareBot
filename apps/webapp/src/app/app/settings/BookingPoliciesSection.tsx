'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import type { BookingPolicy, LateCancellationBehavior } from '@/modules/booking-policies/types';
import { apiJson } from '@/shared/lib/apiJson';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Switch } from '@/shared/ui/doctor/primitives/switch';

const BASE = '/api/admin/booking-engine/policies';

const LATE_ACTION_OPTIONS: { value: LateCancellationBehavior; label: string }[] = [
  { value: 'manual_review', label: 'Ручное решение' },
  { value: 'penalty', label: 'Штраф' },
  { value: 'charge_package', label: 'Списание абонемента' },
  { value: 'retain_prepayment', label: 'Удержать предоплату' },
  { value: 'refund_prepayment', label: 'Вернуть предоплату' },
];

export function BookingPoliciesSection() {
  const [policy, setPolicy] = useState<BookingPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const json = await apiJson<{ ok?: boolean; policy?: BookingPolicy }>(BASE);
      setPolicy(json.policy ?? null);
      setError(null);
    } catch {
      setError('Не удалось загрузить политику');
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function save() {
    if (!policy) return;
    startTransition(async () => {
      try {
        const json = await apiJson<{ ok?: boolean; policy?: BookingPolicy }>(BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cancellationPolicyId: policy.cancellationPolicyId,
            reschedulePolicyId: policy.reschedulePolicyId,
            cancellationAllowed: policy.cancellationAllowed,
            rescheduleAllowed: policy.rescheduleAllowed,
            freeChangeHoursBefore: policy.freeChangeHoursBefore,
            lateChangeBehavior: policy.lateChangeBehavior,
            refundPrepaymentOnLate: policy.refundPrepaymentOnLate,
            chargePackageSessionOnLate: policy.chargePackageSessionOnLate,
            requiresStaffConfirmation: policy.requiresStaffConfirmation,
          }),
        });
        if (json.policy) setPolicy(json.policy);
        setError(null);
      } catch {
        setError('Не удалось сохранить политику');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Политика отмены и переноса</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {policy ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={policy.cancellationAllowed}
                onCheckedChange={(cancellationAllowed) =>
                  setPolicy((current) =>
                    current ? { ...current, cancellationAllowed } : current,
                  )
                }
              />
              <Label>Самостоятельная отмена</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={policy.rescheduleAllowed}
                onCheckedChange={(rescheduleAllowed) =>
                  setPolicy((current) => (current ? { ...current, rescheduleAllowed } : current))
                }
              />
              <Label>Самостоятельный перенос</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-policy-free-hours">Без штрафа до начала записи, часов</Label>
              <Input
                id="booking-policy-free-hours"
                type="number"
                min={0}
                value={policy.freeChangeHoursBefore}
                onChange={(event) =>
                  setPolicy((current) =>
                    current
                      ? { ...current, freeChangeHoursBefore: Number(event.target.value) || 0 }
                      : current,
                  )
                }
              />
            </div>
            <div className="space-y-2">
              <Label>После этого срока</Label>
              <Select
                value={policy.lateChangeBehavior}
                onValueChange={(value) =>
                  value &&
                  setPolicy((current) =>
                    current
                      ? { ...current, lateChangeBehavior: value as LateCancellationBehavior }
                      : current,
                  )
                }
              >
                <SelectTrigger
                  className="w-full"
                  displayLabel={
                    LATE_ACTION_OPTIONS.find((item) => item.value === policy.lateChangeBehavior)
                      ?.label
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LATE_ACTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} label={option.label}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end sm:col-span-2">
              <Button type="button" size="sm" disabled={pending} onClick={save}>
                Сохранить
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
