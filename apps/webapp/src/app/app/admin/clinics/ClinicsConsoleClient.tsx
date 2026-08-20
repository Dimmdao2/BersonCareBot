'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';
import type { SaasBillingOverview as SaasBillingOverviewData } from '@/modules/saas-billing/ports';
import {
  MECHANICS,
  MECHANIC_REGISTRY,
  QUOTA_UNIT_LABELS,
  type OrgMechanic,
  type OrgQuotaProjection,
  type Tariff,
  type TariffQuota,
} from '@/modules/org-entitlements/types';
import { DOCTOR_CATALOG_FILTER_MISSING } from '@/shared/lib/doctorCatalogEmptyFieldFilter';
import type { ReferenceItemDto } from '@/modules/references/referenceCache';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { ReferenceSelect } from '@/shared/ui/doctor/ReferenceSelect';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import {
  doctorSectionItemClass,
  doctorSectionSubtitleClass,
} from '@/shared/ui/doctor/doctorVisual';
import { Badge } from '@/shared/ui/doctor/primitives/badge';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';
import { SaasBillingOverview } from '@/shared/ui/doctor/SaasBillingOverview';
import { apiJson } from '@/shared/lib/apiJson';
import { OrganizationCommercialPanel } from './OrganizationCommercialPanel';

export type PlatformClinicsData = {
  organizations: PlatformOrganizationSummary[];
  tariffs: Tariff[];
  enforcedQuotaUsage: Record<string, Partial<Record<OrgMechanic, number>>>;
  /** §5a stage 6.2 — usage/limit/threshold per organization, from `resolveOrgQuotaProjections`. */
  quotaProjections: Record<string, OrgQuotaProjection[]>;
};

export type PlatformClinicMember = {
  id: string;
  displayName: string | null;
  role: 'owner' | 'admin' | 'doctor' | 'assistant';
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
  specialistLinked: boolean;
};

type ClinicsApiResponse = ({ ok: true } & PlatformClinicsData) | { ok: false; error?: string };
type MembersApiResponse =
  | { ok: true; members: PlatformClinicMember[] }
  | { ok: false; error?: string };
type BillingApiResponse =
  | { ok: true; billing: SaasBillingOverviewData }
  | { ok: false; error?: string };

const LIFECYCLE_LABELS: Record<
  PlatformOrganizationSummary['effectiveAccess']['lifecycle'],
  string
> = {
  active: 'Активна',
  grace: 'Льготный период',
  read_only: 'Только чтение',
  blocked: 'Заблокирована',
};

const TRIAL_STATUS_LABELS: Record<
  NonNullable<PlatformOrganizationSummary['trial']>['status'],
  string
> = {
  active: 'Активен',
  expired: 'Истёк',
  ended: 'Завершён',
};

const MEMBERSHIP_ROLE_LABELS: Record<PlatformClinicMember['role'], string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  doctor: 'Врач',
  assistant: 'Ассистент',
};

const MEMBERSHIP_STATUS_LABELS: Record<PlatformClinicMember['status'], string> = {
  active: 'Активен',
  invited: 'Приглашён',
  disabled: 'Отключён',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function tariffName(
  organization: PlatformOrganizationSummary,
  tariffsById: Map<string, Tariff>,
): string {
  const id = organization.effectiveAccess.tariffId;
  return id ? (tariffsById.get(id)?.name ?? 'Тариф не найден') : 'Не назначен';
}

function trialSummary(organization: PlatformOrganizationSummary): string {
  if (!organization.trial) return 'Не запускался';
  return `${TRIAL_STATUS_LABELS[organization.trial.status]} · до ${formatDate(organization.trial.endsAt)}`;
}

function lifecycleBadgeVariant(
  lifecycle: PlatformOrganizationSummary['effectiveAccess']['lifecycle'],
): 'secondary' | 'outline' | 'destructive' {
  if (lifecycle === 'blocked') return 'destructive';
  if (lifecycle === 'active') return 'secondary';
  return 'outline';
}

function mechanicLabel(mechanic: string): string {
  return mechanic in MECHANIC_REGISTRY
    ? MECHANIC_REGISTRY[mechanic as OrgMechanic].label
    : mechanic;
}

function quotaLabel(quota: TariffQuota): string {
  if (quota.kind === 'unlimited') return 'без лимита';
  const unit =
    quota.unit in QUOTA_UNIT_LABELS
      ? QUOTA_UNIT_LABELS[quota.unit as keyof typeof QUOTA_UNIT_LABELS].toLocaleLowerCase('ru-RU')
      : quota.unit;
  return `лимит ${quota.limit} ${unit}`;
}

function OverridesSection({ organization }: { organization: PlatformOrganizationSummary }) {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Переопределения</DoctorSectionTitle>
        <p className={doctorSectionSubtitleClass}>Исключения клиники поверх назначенного тарифа</p>
      </DoctorSectionHeader>
      {organization.overrides.length === 0 ? (
        <DoctorEmptyState size="xs">Переопределений нет.</DoctorEmptyState>
      ) : (
        <div className="grid gap-2">
          {organization.overrides.map((override) => (
            <div key={override.id} className={doctorSectionItemClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{mechanicLabel(override.mechanic)}</span>
                <Badge variant={override.enabled ? 'secondary' : 'outline'}>
                  {override.enabled ? 'Разрешено' : 'Отключено'}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {override.quota ? <span>{quotaLabel(override.quota)}</span> : null}
                {override.seatLimitOverride !== null ? (
                  <span>мест: {override.seatLimitOverride}</span>
                ) : null}
                {override.expiresAt ? (
                  <span>до {formatDate(override.expiresAt)}</span>
                ) : (
                  <span>без срока</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </DoctorSection>
  );
}

const QUOTA_THRESHOLD_LABEL: Record<OrgQuotaProjection['threshold'], string | null> = {
  below_warning: null,
  warning: 'Приближается к пределу',
  reached: 'Превышение',
};

function UsageSection({
  usage,
  projections,
}: {
  usage: Partial<Record<OrgMechanic, number>> | undefined;
  /** §5a stage 6.2 — usage against the organization's actual configured limit, when one exists. */
  projections: OrgQuotaProjection[];
}) {
  const trackedMechanics = MECHANICS.filter(
    (mechanic) => MECHANIC_REGISTRY[mechanic].quotaEnforcement !== 'declared_no_enforcement',
  );
  const untrackedMechanics = MECHANICS.filter(
    (mechanic) => MECHANIC_REGISTRY[mechanic].quotaEnforcement === 'declared_no_enforcement',
  );
  const projectionByMechanic = new Map(
    projections.map((projection) => [projection.mechanic, projection]),
  );

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Расход</DoctorSectionTitle>
        <p className={doctorSectionSubtitleClass}>
          Только значения, для которых в продукте есть настоящий счётчик
        </p>
      </DoctorSectionHeader>
      <div className="grid gap-2 sm:grid-cols-2">
        {trackedMechanics.map((mechanic) => {
          const projection = projectionByMechanic.get(mechanic);
          const value = usage?.[mechanic];
          const thresholdLabel = projection ? QUOTA_THRESHOLD_LABEL[projection.threshold] : null;
          return (
            <div key={mechanic} className={doctorSectionItemClass}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{MECHANIC_REGISTRY[mechanic].label}</span>
                {projection ? (
                  <span className="text-lg font-semibold tabular-nums">
                    {projection.usage} из {projection.quota.limit}
                  </span>
                ) : value === undefined ? (
                  <span className="text-xs text-muted-foreground">значение не получено</span>
                ) : (
                  <span className="text-lg font-semibold tabular-nums">{value}</span>
                )}
              </div>
              {thresholdLabel ? (
                <Badge
                  variant={projection?.threshold === 'reached' ? 'destructive' : 'outline'}
                  className="mt-1"
                >
                  {thresholdLabel}
                </Badge>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {projection ? 'в пределах лимита' : 'текущее количество'}
                </p>
              )}
            </div>
          );
        })}
        {untrackedMechanics.map((mechanic) => (
          <div key={mechanic} className={doctorSectionItemClass}>
            <div className="flex items-center justify-between gap-3">
              <span>{MECHANIC_REGISTRY[mechanic].label}</span>
              <span className="text-xs text-muted-foreground">не отслеживается</span>
            </div>
          </div>
        ))}
      </div>
      {trackedMechanics.some((mechanic) => usage?.[mechanic] === undefined) ? (
        <p className="text-xs text-muted-foreground">
          Значение счётчика расхода не получено. Обновите страницу; если это повторится, проверьте
          «Здоровье системы».
        </p>
      ) : null}
    </DoctorSection>
  );
}

function ClinicAccountsSection({ members }: { members: PlatformClinicMember[] }) {
  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Аккаунты клиники</DoctorSectionTitle>
      </DoctorSectionHeader>
      {members.length === 0 ? (
        <DoctorEmptyState size="xs">Сотрудников нет.</DoctorEmptyState>
      ) : (
        <div className="grid gap-2">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3 px-3 text-xs font-medium text-muted-foreground md:grid">
            <span>Имя</span>
            <span>Роль</span>
            <span>Статус</span>
            <span>Специалист</span>
            <span>В клинике с</span>
          </div>
          {members.map((member) => (
            <div
              key={member.id}
              className={`${doctorSectionItemClass} grid gap-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] md:items-center md:gap-3`}
            >
              <span className="min-w-0 truncate font-medium">
                {member.displayName ?? 'Имя не указано'}
              </span>
              <span>
                <span className="text-xs text-muted-foreground md:hidden">Роль: </span>
                {MEMBERSHIP_ROLE_LABELS[member.role]}
              </span>
              <span>
                <Badge variant={member.status === 'active' ? 'secondary' : 'outline'}>
                  {MEMBERSHIP_STATUS_LABELS[member.status]}
                </Badge>
              </span>
              <span>
                <span className="text-xs text-muted-foreground md:hidden">
                  Карточка специалиста:{' '}
                </span>
                {member.specialistLinked ? 'Есть' : 'Нет'}
              </span>
              <span className="text-sm text-muted-foreground">
                <span className="md:hidden">В клинике с: </span>
                {formatDate(member.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </DoctorSection>
  );
}

const TRIAL_NOT_STARTED_LABEL = 'Не запускался';

function ClinicsList({ data }: { data: PlatformClinicsData }) {
  const tariffsById = useMemo(
    () => new Map(data.tariffs.map((tariff) => [tariff.id, tariff])),
    [data.tariffs],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [trialFilter, setTrialFilter] = useState<string | null>(null);
  const [tariffFilter, setTariffFilter] = useState<string | null>(null);

  const statusItems: ReferenceItemDto[] = useMemo(
    () =>
      (
        Object.keys(LIFECYCLE_LABELS) as Array<
          PlatformOrganizationSummary['effectiveAccess']['lifecycle']
        >
      ).map((lifecycle, sortOrder) => ({
        id: lifecycle,
        code: lifecycle,
        title: LIFECYCLE_LABELS[lifecycle],
        sortOrder,
      })),
    [],
  );

  const trialItems: ReferenceItemDto[] = useMemo(
    () =>
      (
        Object.keys(TRIAL_STATUS_LABELS) as Array<
          NonNullable<PlatformOrganizationSummary['trial']>['status']
        >
      ).map((status, sortOrder) => ({
        id: status,
        code: status,
        title: TRIAL_STATUS_LABELS[status],
        sortOrder,
      })),
    [],
  );

  const tariffItems: ReferenceItemDto[] = useMemo(
    () =>
      data.tariffs.map((tariff, sortOrder) => ({
        id: tariff.id,
        code: tariff.id,
        title: tariff.name,
        sortOrder,
      })),
    [data.tariffs],
  );

  const filteredOrganizations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.organizations.filter((organization) => {
      if (query && !organization.title.toLowerCase().includes(query)) return false;
      if (statusFilter && organization.effectiveAccess.lifecycle !== statusFilter) return false;
      if (trialFilter) {
        if (trialFilter === DOCTOR_CATALOG_FILTER_MISSING) {
          if (organization.trial) return false;
        } else if (organization.trial?.status !== trialFilter) {
          return false;
        }
      }
      if (tariffFilter) {
        if (tariffFilter === DOCTOR_CATALOG_FILTER_MISSING) {
          if (organization.effectiveAccess.tariffId) return false;
        } else if (organization.effectiveAccess.tariffId !== tariffFilter) {
          return false;
        }
      }
      return true;
    });
  }, [data.organizations, searchQuery, statusFilter, trialFilter, tariffFilter]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || statusFilter || trialFilter || tariffFilter,
  );

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter(null);
    setTrialFilter(null);
    setTariffFilter(null);
  };

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Клиники</DoctorSectionTitle>
        <p className={doctorSectionSubtitleClass}>
          Клиники как клиенты платформы — без клинических и пациентских данных
        </p>
      </DoctorSectionHeader>
      {data.organizations.length === 0 ? (
        <DoctorEmptyState>Клиники ещё не созданы.</DoctorEmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full min-w-[180px] sm:w-56">
              <label className="sr-only" htmlFor="clinics-filter-q">
                Поиск по названию
              </label>
              <Input
                id="clinics-filter-q"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию"
                className="w-full"
              />
            </div>
            <div className="w-40 shrink-0">
              <label className="sr-only" htmlFor="clinics-filter-status">
                Статус оплаты
              </label>
              <ReferenceSelect
                id="clinics-filter-status"
                prefetchedItems={statusItems}
                valueMatch="code"
                submitField="code"
                value={statusFilter}
                onChange={(code) => setStatusFilter(code)}
                placeholder="Статус оплаты"
                clearOptionLabel="Все статусы"
                showAllOnFocus
                searchable={false}
              />
            </div>
            <div className="w-40 shrink-0">
              <label className="sr-only" htmlFor="clinics-filter-trial">
                Пробный период
              </label>
              <ReferenceSelect
                id="clinics-filter-trial"
                prefetchedItems={trialItems}
                valueMatch="code"
                submitField="code"
                value={trialFilter}
                onChange={(code) => setTrialFilter(code)}
                placeholder="Пробный период"
                clearOptionLabel="Все"
                missingValueOption={{
                  value: DOCTOR_CATALOG_FILTER_MISSING,
                  label: TRIAL_NOT_STARTED_LABEL,
                }}
                showAllOnFocus
                searchable={false}
              />
            </div>
            <div className="w-40 shrink-0">
              <label className="sr-only" htmlFor="clinics-filter-tariff">
                Тариф
              </label>
              <ReferenceSelect
                id="clinics-filter-tariff"
                prefetchedItems={tariffItems}
                valueMatch="code"
                submitField="code"
                value={tariffFilter}
                onChange={(code) => setTariffFilter(code)}
                placeholder="Тариф"
                clearOptionLabel="Все тарифы"
                missingValueOption={{
                  value: DOCTOR_CATALOG_FILTER_MISSING,
                  label: 'Не назначен',
                }}
                showAllOnFocus
                searchable={false}
              />
            </div>
            {hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Сбросить
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Показано {filteredOrganizations.length} из {data.organizations.length}
          </p>
          {filteredOrganizations.length === 0 ? (
            <DoctorEmptyState size="xs">Ничего не найдено по заданным фильтрам.</DoctorEmptyState>
          ) : (
            <div className="grid gap-2">
              <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-3 text-xs font-medium text-muted-foreground md:grid">
                <span>Название</span>
                <span>Тариф</span>
                <span>Состояние</span>
                <span>Пробный период</span>
              </div>
              {filteredOrganizations.map((organization) => (
                <Link
                  key={organization.id}
                  href={`/app/admin/clinics/${organization.id}`}
                  className={`${doctorSectionItemClass} grid gap-2 transition-colors hover:border-primary/30 hover:bg-muted/30 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:gap-3`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{organization.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {organization.isActive ? 'Организация активна' : 'Организация отключена'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground md:hidden">Тариф: </span>
                    <span>{tariffName(organization, tariffsById)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={lifecycleBadgeVariant(organization.effectiveAccess.lifecycle)}>
                      {LIFECYCLE_LABELS[organization.effectiveAccess.lifecycle]}
                    </Badge>
                    {(data.quotaProjections[organization.id] ?? []).some(
                      (projection) => projection.threshold === 'reached',
                    ) && <Badge variant="destructive">Превышение</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="md:hidden">Пробный период: </span>
                    {trialSummary(organization)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </DoctorSection>
  );
}

function OrganizationAccountPanel({
  organization,
  onOrganizationsRefresh,
}: {
  organization: PlatformOrganizationSummary;
  onOrganizationsRefresh: () => Promise<boolean>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const targetActive = !organization.isActive;

  const submit = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await apiJson<{ ok: boolean }>(`/api/admin/organizations/${organization.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: targetActive, reason }),
      });
      setDialogOpen(false);
      setReason('');
      const refreshed = await onOrganizationsRefresh();
      if (!refreshed) setActionError('Сохранено, но список не обновился — обновите страницу.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={doctorSectionItemClass}>
        <dt className="text-xs text-muted-foreground">Учётная запись</dt>
        <dd className="mt-1 space-y-2">
          <p className="font-medium">{organization.isActive ? 'Включена' : 'Отключена'}</p>
          <Button
            type="button"
            size="sm"
            variant={organization.isActive ? 'destructive' : 'default'}
            onClick={() => {
              setActionError(null);
              setDialogOpen(true);
            }}
          >
            {organization.isActive ? 'Отключить' : 'Включить'}
          </Button>
        </dd>
      </div>
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!busy) setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {organization.isActive ? 'Отключить учётную запись' : 'Включить учётную запись'}
            </DialogTitle>
            <DialogDescription>{organization.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="organization-account-reason">Причина (необязательно)</Label>
            <Input
              id="organization-account-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
            />
            {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setDialogOpen(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              variant={organization.isActive ? 'destructive' : 'default'}
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? 'Сохраняем…' : organization.isActive ? 'Отключить' : 'Включить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClinicDetail({
  data,
  members,
  organizationId,
  billing,
  billingError,
  onOrganizationsRefresh,
}: {
  data: PlatformClinicsData;
  members: PlatformClinicMember[];
  organizationId: string;
  billing: SaasBillingOverviewData | null;
  billingError: boolean;
  onOrganizationsRefresh: () => Promise<boolean>;
}) {
  const organization = data.organizations.find((item) => item.id === organizationId);
  const tariffsById = useMemo(
    () => new Map(data.tariffs.map((tariff) => [tariff.id, tariff])),
    [data.tariffs],
  );

  if (!organization) {
    return (
      <DoctorSection>
        <DoctorEmptyState>
          <p>Клиника не найдена в списке платформы.</p>
          <Link
            href="/app/admin/clinics"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Вернуться к клиникам
          </Link>
        </DoctorEmptyState>
      </DoctorSection>
    );
  }

  return (
    <>
      <DoctorSection>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <DoctorSectionTitle>{organization.title}</DoctorSectionTitle>
            <p className={doctorSectionSubtitleClass}>
              Клинические карточки недоступны в режиме платформы
            </p>
          </div>
          <Link
            href="/app/admin/clinics"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Все клиники
          </Link>
        </div>
        <dl className="grid gap-2 sm:grid-cols-3">
          <div className={doctorSectionItemClass}>
            <dt className="text-xs text-muted-foreground">Тариф</dt>
            <dd className="mt-1 font-medium">{tariffName(organization, tariffsById)}</dd>
          </div>
          <div className={doctorSectionItemClass}>
            <dt className="text-xs text-muted-foreground">Состояние</dt>
            <dd className="mt-1">
              <Badge variant={lifecycleBadgeVariant(organization.effectiveAccess.lifecycle)}>
                {LIFECYCLE_LABELS[organization.effectiveAccess.lifecycle]}
              </Badge>
            </dd>
          </div>
          <OrganizationAccountPanel
            organization={organization}
            onOrganizationsRefresh={onOrganizationsRefresh}
          />
        </dl>
      </DoctorSection>

      <OrganizationCommercialPanel
        organization={organization}
        tariffs={data.tariffs}
        onUpdated={onOrganizationsRefresh}
      />

      <ClinicAccountsSection members={members} />
      <OverridesSection organization={organization} />
      <UsageSection
        usage={data.enforcedQuotaUsage[organization.id]}
        projections={data.quotaProjections[organization.id] ?? []}
      />
      {billingError ? (
        <DoctorSection>
          <DoctorSectionTitle>Биллинг не загрузился</DoctorSectionTitle>
          <p className="text-sm text-muted-foreground">
            Обновите страницу; если ошибка повторится, проверьте «Здоровье системы».
          </p>
        </DoctorSection>
      ) : billing ? (
        <SaasBillingOverview billing={billing} showProviderEvents />
      ) : (
        <DoctorSection>
          <DoctorEmptyState>Загружаем биллинг…</DoctorEmptyState>
        </DoctorSection>
      )}
    </>
  );
}

export function ClinicsConsoleClient({
  organizationId,
  initialData,
  initialBillingOverview,
  initialMembers,
}: {
  organizationId?: string;
  initialData?: PlatformClinicsData;
  initialBillingOverview?: SaasBillingOverviewData;
  initialMembers?: PlatformClinicMember[];
}) {
  const [data, setData] = useState<PlatformClinicsData | null>(initialData ?? null);
  const [members, setMembers] = useState<PlatformClinicMember[] | null>(
    organizationId ? (initialMembers ?? null) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<SaasBillingOverviewData | null>(
    initialBillingOverview ?? null,
  );
  const [billingError, setBillingError] = useState(false);

  const reloadOrganizations = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/admin/organizations', { cache: 'no-store' });
      const body = (await response.json().catch(() => null)) as ClinicsApiResponse | null;
      if (!response.ok || !body?.ok) return false;
      setData(body);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (initialData && (!organizationId || initialMembers)) return;
    let active = true;

    const clinicsRequest = initialData
      ? Promise.resolve(initialData)
      : fetch('/api/admin/organizations', { cache: 'no-store' }).then(async (response) => {
          const body = (await response.json().catch(() => null)) as ClinicsApiResponse | null;
          if (!response.ok || !body?.ok) {
            if (response.status === 401 || response.status === 403) {
              throw new Error('access');
            }
            throw new Error('service');
          }
          return body;
        });
    const membersRequest =
      organizationId && !initialMembers
        ? fetch(`/api/admin/organizations/${organizationId}/members`, {
            cache: 'no-store',
          }).then(async (response) => {
            const body = (await response.json().catch(() => null)) as MembersApiResponse | null;
            if (!response.ok || !body?.ok) {
              if (response.status === 401 || response.status === 403) {
                throw new Error('access');
              }
              throw new Error('service');
            }
            return body.members;
          })
        : Promise.resolve(initialMembers ?? []);

    void Promise.all([clinicsRequest, membersRequest])
      .then(([nextData, nextMembers]) => {
        if (!active) return;
        setData(nextData);
        setMembers(nextMembers);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'network');
      });

    return () => {
      active = false;
    };
  }, [initialData, initialMembers, organizationId]);

  useEffect(() => {
    if (
      !organizationId ||
      initialBillingOverview ||
      !data?.organizations.some((organization) => organization.id === organizationId)
    ) {
      return;
    }
    let active = true;

    void fetch(`/api/admin/organizations/${organizationId}/billing`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as BillingApiResponse | null;
        if (!response.ok || !body?.ok) throw new Error('billing');
        if (active) setBilling(body.billing);
      })
      .catch(() => {
        if (active) setBillingError(true);
      });

    return () => {
      active = false;
    };
  }, [data, initialBillingOverview, organizationId]);

  if (error) {
    const accessDenied = error === 'access';
    return (
      <DoctorSection>
        <DoctorSectionTitle>
          {organizationId ? 'Карточка клиники не загрузилась' : 'Список клиник не загрузился'}
        </DoctorSectionTitle>
        <p className="text-sm text-muted-foreground">
          {accessDenied
            ? 'Сессия не имеет платформенного доступа.'
            : organizationId
              ? 'Сервис данных клиники не ответил или вернул ошибку.'
              : 'Сервис организаций не ответил или вернул ошибку.'}
        </p>
        <p className="text-sm">
          {accessDenied
            ? 'Войдите под глобальным администратором и повторите.'
            : 'Обновите страницу; если ошибка повторится, проверьте «Здоровье системы».'}
        </p>
      </DoctorSection>
    );
  }

  if (!data || (organizationId && !members)) {
    return (
      <DoctorSection>
        <DoctorEmptyState>Загружаем клиники…</DoctorEmptyState>
      </DoctorSection>
    );
  }

  return organizationId ? (
    <ClinicDetail
      data={data}
      members={members ?? []}
      organizationId={organizationId}
      billing={billing}
      billingError={billingError}
      onOrganizationsRefresh={reloadOrganizations}
    />
  ) : (
    <ClinicsList data={data} />
  );
}
