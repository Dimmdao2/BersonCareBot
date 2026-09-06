'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { apiJson } from '@/shared/lib/apiJson';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import type {
  CancellationPolicy,
  LateCancellationBehavior,
  RescheduleLimitBehavior,
  ReschedulePolicy,
} from '@/modules/booking-policies/types';
import {
  DEFAULT_CANCELLATION_POLICY,
  DEFAULT_RESCHEDULE_POLICY,
} from '@/modules/booking-policies/types';

const BASE = '/api/admin/booking-engine/policies';

const LATE_CANCEL_OPTIONS: { value: LateCancellationBehavior; label: string }[] = [
  { value: 'manual_review', label: 'Ручное решение' },
  { value: 'penalty', label: 'Штраф' },
  { value: 'charge_package', label: 'Списание абонемента' },
  { value: 'retain_prepayment', label: 'Удержать предоплату' },
  { value: 'refund_prepayment', label: 'Вернуть предоплату' },
];

const LIMIT_OPTIONS: { value: RescheduleLimitBehavior; label: string }[] = [
  { value: 'manual_request', label: 'Запрос персоналу' },
  { value: 'deny', label: 'Запретить' },
];

type PolicyKind = 'cancellation' | 'reschedule';

const CANCELLATION_DRAFT_ID = 'draft-cancellation-organization';
const RESCHEDULE_DRAFT_ID = 'draft-reschedule-organization';

function withOrganizationDrafts(input: {
  cancellationPolicies: CancellationPolicy[];
  reschedulePolicies: ReschedulePolicy[];
}) {
  return {
    cancellationPolicies: input.cancellationPolicies.some(
      (policy) => policy.scopeLevel === 'organization',
    )
      ? input.cancellationPolicies
      : [
          ...input.cancellationPolicies,
          {
            ...DEFAULT_CANCELLATION_POLICY,
            id: CANCELLATION_DRAFT_ID,
            organizationId: '',
            scopeLevel: 'organization' as const,
            scopeEntityId: null,
            title: 'Правила отмены клиники',
          },
        ],
    reschedulePolicies: input.reschedulePolicies.some(
      (policy) => policy.scopeLevel === 'organization',
    )
      ? input.reschedulePolicies
      : [
          ...input.reschedulePolicies,
          {
            ...DEFAULT_RESCHEDULE_POLICY,
            id: RESCHEDULE_DRAFT_ID,
            organizationId: '',
            scopeLevel: 'organization' as const,
            scopeEntityId: null,
            title: 'Правила переноса клиники',
          },
        ],
  };
}

type Props = {
  defaultKind?: PolicyKind;
  /** Скрыть переключатель «тип политики» (вкладки правил). */
  lockKind?: boolean;
};

export function BookingPoliciesSection({ defaultKind = 'cancellation', lockKind = false }: Props) {
  const [cancellationPolicies, setCancellationPolicies] = useState<CancellationPolicy[]>([]);
  const [reschedulePolicies, setReschedulePolicies] = useState<ReschedulePolicy[]>([]);
  const [kind, setKind] = useState<PolicyKind>(defaultKind);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    try {
      const json = await apiJson<{
        ok?: boolean;
        cancellationPolicies?: CancellationPolicy[];
        reschedulePolicies?: ReschedulePolicy[];
        error?: string;
      }>(BASE);
      const policies = withOrganizationDrafts({
        cancellationPolicies: json.cancellationPolicies ?? [],
        reschedulePolicies: json.reschedulePolicies ?? [],
      });
      setCancellationPolicies(policies.cancellationPolicies);
      setReschedulePolicies(policies.reschedulePolicies);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    setKind(defaultKind);
  }, [defaultKind]);

  const cancelPolicy =
    cancellationPolicies.find((policy) => policy.scopeLevel === 'organization') ?? null;

  const reschedulePolicy =
    reschedulePolicies.find((policy) => policy.scopeLevel === 'organization') ?? null;

  function saveCancellation(policy: CancellationPolicy) {
    startTransition(async () => {
      try {
        await apiJson(BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'cancellation',
            ...(policy.id === CANCELLATION_DRAFT_ID ? {} : { id: policy.id }),
            scopeLevel: 'organization',
            scopeEntityId: null,
            title: policy.title,
            isActive: policy.isActive,
            freeCancelHoursBefore: policy.freeCancelHoursBefore,
            cancellationAllowed: policy.cancellationAllowed,
            lateCancellationBehavior: policy.lateCancellationBehavior,
            refundPrepaymentOnLate: policy.refundPrepaymentOnLate,
            chargePackageSessionOnLate: policy.chargePackageSessionOnLate,
            requiresStaffConfirmation: policy.requiresStaffConfirmation,
            sortOrder: policy.sortOrder,
          }),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка сети');
      }
    });
  }

  function saveReschedule(policy: ReschedulePolicy) {
    startTransition(async () => {
      try {
        await apiJson(BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'reschedule',
            ...(policy.id === RESCHEDULE_DRAFT_ID ? {} : { id: policy.id }),
            scopeLevel: 'organization',
            scopeEntityId: null,
            title: policy.title,
            isActive: policy.isActive,
            selfRescheduleHoursBefore: policy.selfRescheduleHoursBefore,
            maxSelfReschedules: policy.maxSelfReschedules,
            limitExceededBehavior: policy.limitExceededBehavior,
            requiresStaffConfirmation: policy.requiresStaffConfirmation,
            sortOrder: policy.sortOrder,
          }),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка сети');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {lockKind ? (kind === 'cancellation' ? 'Отмена' : 'Перенос') : 'Отмена и перенос'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {!lockKind ? (
            <div className="space-y-2">
              <Label>Тип политики</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as PolicyKind)}>
                <SelectTrigger
                  className="w-full max-w-md"
                  displayLabel={kind === 'cancellation' ? 'Отмена' : 'Перенос'}
                >
                  <SelectValue />
                </SelectTrigger>
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

        {kind === 'cancellation' && cancelPolicy ? (
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
                  className="w-full"
                  displayLabel={
                    LATE_CANCEL_OPTIONS.find(
                      (item) => item.value === cancelPolicy.lateCancellationBehavior,
                    )?.label
                  }
                >
                  <SelectValue />
                </SelectTrigger>
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
                    prev.map((p) =>
                      p.id === cancelPolicy.id ? { ...p, cancellationAllowed: v } : p,
                    ),
                  )
                }
              />
              <Label>Отмена разрешена</Label>
            </div>
            <Button type="button" disabled={pending} onClick={() => saveCancellation(cancelPolicy)}>
              Сохранить отмену
            </Button>
          </div>
        ) : null}

        {kind === 'reschedule' && reschedulePolicy ? (
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
                  className="w-full"
                  displayLabel={
                    LIMIT_OPTIONS.find(
                      (item) => item.value === reschedulePolicy.limitExceededBehavior,
                    )?.label
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMIT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} label={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              disabled={pending}
              onClick={() => saveReschedule(reschedulePolicy)}
            >
              Сохранить перенос
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
