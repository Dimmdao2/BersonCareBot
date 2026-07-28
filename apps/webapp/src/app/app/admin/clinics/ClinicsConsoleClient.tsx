'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';
import {
  MECHANICS,
  MECHANIC_REGISTRY,
  QUOTA_UNIT_LABELS,
  type OrgMechanic,
  type Tariff,
  type TariffQuota,
} from '@/modules/org-entitlements/types';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
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
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';

export type PlatformClinicsData = {
  organizations: PlatformOrganizationSummary[];
  tariffs: Tariff[];
  enforcedQuotaUsage: Record<string, Partial<Record<OrgMechanic, number>>>;
};

type ApiResponse = ({ ok: true } & PlatformClinicsData) | { ok: false; error?: string };

const LIFECYCLE_LABELS: Record<
  PlatformOrganizationSummary['effectiveAccess']['lifecycle'],
  string
> = {
  active: 'Активна',
  grace: 'Льготный период',
  read_only: 'Только чтение',
  blocked: 'Заблокирована',
};

const COMMERCIAL_STATE_LABELS: Record<
  PlatformOrganizationSummary['commercialAccessState'],
  string
> = {
  compatibility: 'Совместимость',
  no_trial: 'Без триала',
  trial_pending: 'Триал ожидается',
  active: 'Коммерческий доступ',
};

const TRIAL_STATUS_LABELS: Record<
  NonNullable<PlatformOrganizationSummary['trial']>['status'],
  string
> = {
  active: 'Активен',
  grace: 'Льготный период',
  expired: 'Истёк',
  ended: 'Завершён',
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

function UsageSection({ usage }: { usage: Partial<Record<OrgMechanic, number>> | undefined }) {
  const trackedMechanics = MECHANICS.filter(
    (mechanic) => MECHANIC_REGISTRY[mechanic].quotaEnforcement !== 'declared_no_enforcement',
  );
  const untrackedMechanics = MECHANICS.filter(
    (mechanic) => MECHANIC_REGISTRY[mechanic].quotaEnforcement === 'declared_no_enforcement',
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
          const value = usage?.[mechanic];
          return (
            <div key={mechanic} className={doctorSectionItemClass}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{MECHANIC_REGISTRY[mechanic].label}</span>
                {value === undefined ? (
                  <span className="text-xs text-muted-foreground">значение не получено</span>
                ) : (
                  <span className="text-lg font-semibold tabular-nums">{value}</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">текущее количество</p>
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

function ClinicsList({ data }: { data: PlatformClinicsData }) {
  const tariffsById = useMemo(
    () => new Map(data.tariffs.map((tariff) => [tariff.id, tariff])),
    [data.tariffs],
  );

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
        <div className="grid gap-2">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 px-3 text-xs font-medium text-muted-foreground md:grid">
            <span>Название</span>
            <span>Тариф</span>
            <span>Состояние</span>
            <span>Пробный период</span>
          </div>
          {data.organizations.map((organization) => (
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
              <div>
                <Badge variant={lifecycleBadgeVariant(organization.effectiveAccess.lifecycle)}>
                  {LIFECYCLE_LABELS[organization.effectiveAccess.lifecycle]}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                <span className="md:hidden">Пробный период: </span>
                {trialSummary(organization)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </DoctorSection>
  );
}

function ClinicDetail({
  data,
  organizationId,
}: {
  data: PlatformClinicsData;
  organizationId: string;
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
        <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className={doctorSectionItemClass}>
            <dt className="text-xs text-muted-foreground">Коммерческий режим</dt>
            <dd className="mt-1 font-medium">
              {COMMERCIAL_STATE_LABELS[organization.commercialAccessState]}
            </dd>
          </div>
          <div className={doctorSectionItemClass}>
            <dt className="text-xs text-muted-foreground">Организация</dt>
            <dd className="mt-1 font-medium">{organization.isActive ? 'Активна' : 'Отключена'}</dd>
          </div>
        </dl>
      </DoctorSection>

      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Пробный период</DoctorSectionTitle>
        </DoctorSectionHeader>
        {organization.trial ? (
          <dl className="grid gap-2 sm:grid-cols-3">
            <div className={doctorSectionItemClass}>
              <dt className="text-xs text-muted-foreground">Статус</dt>
              <dd className="mt-1 font-medium">{TRIAL_STATUS_LABELS[organization.trial.status]}</dd>
            </div>
            <div className={doctorSectionItemClass}>
              <dt className="text-xs text-muted-foreground">Окончание</dt>
              <dd className="mt-1 font-medium">{formatDate(organization.trial.endsAt)}</dd>
            </div>
            <div className={doctorSectionItemClass}>
              <dt className="text-xs text-muted-foreground">Льготный период до</dt>
              <dd className="mt-1 font-medium">{formatDate(organization.trial.graceEndsAt)}</dd>
            </div>
          </dl>
        ) : (
          <DoctorEmptyState size="xs">Пробный период не запускался.</DoctorEmptyState>
        )}
      </DoctorSection>

      <OverridesSection organization={organization} />
      <UsageSection usage={data.enforcedQuotaUsage[organization.id]} />
    </>
  );
}

export function ClinicsConsoleClient({
  organizationId,
  initialData,
}: {
  organizationId?: string;
  initialData?: PlatformClinicsData;
}) {
  const [data, setData] = useState<PlatformClinicsData | null>(initialData ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let active = true;

    void fetch('/api/admin/organizations', { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok || !body?.ok) {
          if (response.status === 401 || response.status === 403) {
            throw new Error('access');
          }
          throw new Error('service');
        }
        if (active) setData(body);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'network');
      });

    return () => {
      active = false;
    };
  }, [initialData]);

  if (error) {
    const accessDenied = error === 'access';
    return (
      <DoctorSection>
        <DoctorSectionTitle>Список клиник не загрузился</DoctorSectionTitle>
        <p className="text-sm text-muted-foreground">
          {accessDenied
            ? 'Сессия не имеет платформенного доступа.'
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

  if (!data) {
    return (
      <DoctorSection>
        <DoctorEmptyState>Загружаем клиники…</DoctorEmptyState>
      </DoctorSection>
    );
  }

  return organizationId ? (
    <ClinicDetail data={data} organizationId={organizationId} />
  ) : (
    <ClinicsList data={data} />
  );
}
