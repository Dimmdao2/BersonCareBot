'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';
import type { Tariff, TrialPolicy } from '@/modules/org-entitlements/types';
import {
  COMMERCIAL_ORG_LIFECYCLE_LABELS,
  COMMERCIAL_TRIAL_STATUS_LABELS,
  formatCommercialLocaleDateTime,
  postAdminCommercialMutation,
  type CommercialMutationResult,
} from '@/app/app/admin/commercial/commercialOrganizationLabels';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';

export function OrganizationCommercialPanel({
  organization,
  tariffs,
  onUpdated,
}: {
  organization: PlatformOrganizationSummary;
  tariffs: Tariff[];
  onUpdated: () => Promise<boolean>;
}) {
  const [trialPolicy, setTrialPolicy] = useState<TrialPolicy | null>(null);
  const [assignedTariffId, setAssignedTariffId] = useState(
    organization.manualTariffId ?? 'none',
  );
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const activeTariffs = useMemo(() => tariffs.filter((tariff) => tariff.isActive), [tariffs]);
  const tariffsById = useMemo(
    () => new Map(tariffs.map((tariff) => [tariff.id, tariff])),
    [tariffs],
  );

  const selectedManualTariffId = assignedTariffId === 'none' ? null : assignedTariffId;
  const manualAssignmentChanged =
    selectedManualTariffId !== organization.manualTariffId ||
    organization.scheduledTariff !== null;
  const assignmentEndsTrial = Boolean(
    organization.trial && organization.trial.status !== 'ended',
  );
  const canStartTrial = Boolean(
    organization.tariffId && organization.trial === null && trialPolicy?.isActive,
  );

  useEffect(() => {
    setAssignedTariffId(organization.manualTariffId ?? 'none');
  }, [organization.manualTariffId, organization.id]);

  useEffect(() => {
    let active = true;
    void fetch('/api/admin/commercial', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as { trialPolicy?: TrialPolicy | null };
        if (!response.ok) return;
        if (active) setTrialPolicy(payload.trialPolicy ?? null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const mutate = useCallback(
    async (
      body: Record<string, unknown>,
      success: string | ((result: CommercialMutationResult | undefined) => string),
    ) => {
      setBusy(true);
      setMessage('');
      try {
        const payload = await postAdminCommercialMutation(body);
        const refreshed = await onUpdated();
        const successMessage =
          typeof success === 'function' ? success(payload.result) : success;
        setMessage(
          refreshed
            ? successMessage
            : `${successMessage}. Список не обновился — обновите страницу.`,
        );
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Операция не выполнена');
      } finally {
        setBusy(false);
      }
    },
    [onUpdated],
  );

  return (
    <DoctorSection className="space-y-4">
      <DoctorSectionHeader>
        <DoctorSectionTitle>Тариф и триал</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          Доступ:{' '}
          {COMMERCIAL_ORG_LIFECYCLE_LABELS[organization.effectiveAccess.lifecycle]}
        </p>
        <p>
          Тариф доступа:{' '}
          {tariffsById.get(organization.effectiveAccess.tariffId ?? '')?.name ?? 'не назначен'}
        </p>
        {organization.scheduledTariff ? (
          <p>
            Новый тариф:{' '}
            {tariffsById.get(organization.scheduledTariff.tariffId)?.name ?? 'не найден'} вступит{' '}
            {formatCommercialLocaleDateTime(organization.scheduledTariff.effectiveAt)}
          </p>
        ) : null}
        {organization.trial ? (
          <>
            <p>
              Статус триала: {COMMERCIAL_TRIAL_STATUS_LABELS[organization.trial.status]}
            </p>
            <p>До {formatCommercialLocaleDateTime(organization.trial.endsAt)}</p>
            <p>
              Скидка на оплату до{' '}
              {formatCommercialLocaleDateTime(organization.trial.discountEndsAt)}
            </p>
          </>
        ) : (
          <p>Триал не запускался.</p>
        )}
      </div>
      <div className="space-y-1">
        <Label>Ручной тариф</Label>
        <Select
          value={assignedTariffId}
          onValueChange={(value) => {
            if (value) setAssignedTariffId(value);
          }}
        >
          <SelectTrigger
            displayLabel={
              assignedTariffId === 'none'
                ? 'Без ручного тарифа'
                : (tariffsById.get(assignedTariffId)?.name ?? '')
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без ручного тарифа</SelectItem>
            {activeTariffs.map((tariff) => (
              <SelectItem key={tariff.id} value={tariff.id}>
                {tariff.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`org-commercial-reason-${organization.id}`}>Причина (необязательно)</Label>
        <Input
          id={`org-commercial-reason-${organization.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !manualAssignmentChanged}
          onClick={() =>
            void mutate(
              {
                action: 'assign_tariff',
                organizationId: organization.id,
                tariffId: selectedManualTariffId,
                reason,
              },
              assignmentEndsTrial ? 'Триал завершён, тариф назначен' : 'Тариф организации изменён',
            )
          }
        >
          {assignmentEndsTrial ? 'Завершить триал и назначить' : 'Назначить тариф'}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !canStartTrial}
          onClick={() =>
            void mutate({ action: 'start_trial', organizationId: organization.id, reason }, (result) =>
              result?.created
                ? 'Триал запущен'
                : result
                  ? 'Триал не запущен: он уже был использован'
                  : 'Триал не запущен: активная политика не настроена',
            )
          }
        >
          Запустить триал
        </Button>
        <Link
          href={`/app/admin/commercial?organizationId=${organization.id}`}
          className={buttonVariants({ variant: 'outline', size: 'default' })}
        >
          Исключения и политики
        </Link>
      </div>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </DoctorSection>
  );
}
