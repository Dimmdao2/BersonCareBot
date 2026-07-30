'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  MECHANIC_REGISTRY,
  MECHANICS,
  type AccessLifecyclePolicy,
  type AccessTerminalState,
  type MechanicAccessPolicyMap,
  type OrgMechanic,
  type Tariff,
  type TariffQuota,
  type TariffQuotaMap,
  type TrialPolicy,
} from '@/modules/org-entitlements/types';
import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/doctor/primitives/tabs';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';

type CommercialState = {
  tariffs: Tariff[];
  organizations: PlatformOrganizationSummary[];
  trialPolicy: TrialPolicy | null;
};

type CommercialMutationResult = { created?: boolean; endsAt?: string } | null;
type CommercialMutationResponse = { error?: string; result?: CommercialMutationResult };

const COMMERCIAL_LIFECYCLE_LABELS: Record<
  PlatformOrganizationSummary['effectiveAccess']['lifecycle'],
  string
> = {
  active: 'Активен',
  grace: 'Льготный период',
  read_only: 'Только чтение',
  blocked: 'Заблокирован',
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

type TariffDraft = {
  id: string | null;
  name: string;
  description: string;
  priceRub: string;
  billingPeriod: Tariff['billingPeriod'];
  includedSeats: string;
  includedSeatsWarningAtPercent: string;
  isActive: boolean;
  mechanics: Record<OrgMechanic, boolean>;
  quotas: TariffQuotaMap;
  systemAccessPolicy: AccessPolicyDraft | null;
  mechanicAccessPolicies: Partial<Record<OrgMechanic, AccessPolicyDraft>>;
};

type AccessPolicyDraft = {
  graceDays: string;
  readOnlyDays: string;
  warningCount: string;
  terminalState: AccessTerminalState | null;
};

const CONSTRUCTOR_MECHANICS = MECHANICS.filter(
  (mechanic) => MECHANIC_REGISTRY[mechanic].class === 'возможность',
);
const OVERRIDABLE_MECHANICS = MECHANICS.filter(
  (mechanic) => MECHANIC_REGISTRY[mechanic].class !== 'никогда',
);
const POLICY_MECHANICS = OVERRIDABLE_MECHANICS;

const emptyMechanics = (): Record<OrgMechanic, boolean> =>
  Object.fromEntries(CONSTRUCTOR_MECHANICS.map((mechanic) => [mechanic, false])) as Record<
    OrgMechanic,
    boolean
  >;

function emptyTariffDraft(): TariffDraft {
  return {
    id: null,
    name: '',
    description: '',
    priceRub: '',
    billingPeriod: 'month',
    includedSeats: '',
    includedSeatsWarningAtPercent: '',
    isActive: true,
    mechanics: emptyMechanics(),
    quotas: {},
    systemAccessPolicy: null,
    mechanicAccessPolicies: {},
  };
}

function tariffToDraft(tariff: Tariff): TariffDraft {
  return {
    id: tariff.id,
    name: tariff.name,
    description: tariff.description,
    priceRub: tariff.priceMinor === null ? '' : String(tariff.priceMinor / 100),
    billingPeriod: tariff.billingPeriod,
    includedSeats: tariff.includedSeats === null ? '' : String(tariff.includedSeats),
    includedSeatsWarningAtPercent:
      tariff.includedSeatsWarningAtPercent === null
        ? ''
        : String(tariff.includedSeatsWarningAtPercent),
    isActive: tariff.isActive,
    mechanics: Object.fromEntries(
      CONSTRUCTOR_MECHANICS.map((mechanic) => [mechanic, tariff.mechanics[mechanic] === true]),
    ) as Record<OrgMechanic, boolean>,
    quotas: tariff.quotas,
    systemAccessPolicy: tariff.systemAccessPolicy
      ? accessPolicyToDraft(tariff.systemAccessPolicy)
      : null,
    mechanicAccessPolicies: Object.fromEntries(
      Object.entries(tariff.mechanicAccessPolicies).map(([mechanic, policy]) => [
        mechanic,
        accessPolicyToDraft(policy),
      ]),
    ),
  };
}

function accessPolicyToDraft(policy: AccessLifecyclePolicy): AccessPolicyDraft {
  return {
    graceDays: String(policy.graceDays),
    readOnlyDays: String(policy.readOnlyDays),
    warningCount: String(policy.warningCount),
    terminalState: policy.terminalState,
  };
}

function emptyAccessPolicyDraft(): AccessPolicyDraft {
  return { graceDays: '', readOnlyDays: '', warningCount: '', terminalState: null };
}

function accessPolicyFromDraft(draft: AccessPolicyDraft | null): AccessLifecyclePolicy | null {
  if (!draft) return null;
  const graceDays = nullableNonnegativeInteger(draft.graceDays);
  const readOnlyDays = nullableNonnegativeInteger(draft.readOnlyDays);
  const warningCount = nullableNonnegativeInteger(draft.warningCount);
  if (
    graceDays === null ||
    readOnlyDays === null ||
    warningCount === null ||
    draft.terminalState === null
  ) {
    throw new Error('Заполните все поля лестницы доступа');
  }
  return { graceDays, readOnlyDays, warningCount, terminalState: draft.terminalState };
}

function nullableNonnegativeInteger(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function NumericLimitEditor({
  label,
  unit,
  quota,
  onChange,
}: {
  label: string;
  unit: TariffQuota['unit'];
  quota: TariffQuota | null;
  onChange: (quota: TariffQuota | null) => void;
}) {
  function changeKind(kind: 'none' | TariffQuota['kind']) {
    if (kind === 'none') {
      onChange(null);
      return;
    }
    onChange({
      kind,
      limit: kind === 'numeric' ? (quota?.limit ?? 0) : null,
      unit,
      warningAtPercent: quota?.warningAtPercent ?? null,
    });
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select
        value={quota?.kind ?? 'none'}
        onValueChange={(value) => {
          if (value === 'none' || value === 'numeric' || value === 'unlimited') changeKind(value);
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Не настроено</SelectItem>
          <SelectItem value="numeric">Число</SelectItem>
          <SelectItem value="unlimited">Без ограничения</SelectItem>
        </SelectContent>
      </Select>
      {quota?.kind === 'numeric' ? (
        <Input
          type="number"
          min="0"
          aria-label={label}
          value={quota.limit ?? 0}
          onChange={(event) =>
            onChange({ ...quota, limit: Math.max(0, Number(event.target.value) || 0) })
          }
        />
      ) : null}
      {quota ? (
        <Input
          type="number"
          min="0"
          max="100"
          aria-label={`${label}: предупреждать с процента`}
          placeholder="Предупреждать с, %"
          value={quota.warningAtPercent ?? ''}
          onChange={(event) =>
            onChange({
              ...quota,
              warningAtPercent: nullableNonnegativeInteger(event.target.value),
            })
          }
        />
      ) : null}
    </div>
  );
}

function AccessPolicyEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: AccessPolicyDraft | null;
  onChange: (value: AccessPolicyDraft | null) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-border/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{title}</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange(value ? null : emptyAccessPolicyDraft())}
        >
          {value ? 'Не настроено' : 'Настроить'}
        </Button>
      </div>
      {value ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Label className="space-y-1">
            <span>Терпение: дней</span>
            <Input
              type="number"
              min="0"
              required
              value={value.graceDays}
              onChange={(event) => onChange({ ...value, graceDays: event.target.value })}
            />
          </Label>
          <Label className="space-y-1">
            <span>Предупреждений</span>
            <Input
              type="number"
              min="0"
              required
              value={value.warningCount}
              onChange={(event) => onChange({ ...value, warningCount: event.target.value })}
            />
          </Label>
          <Label className="space-y-1">
            <span>Только чтение: дней</span>
            <Input
              type="number"
              min="0"
              required
              value={value.readOnlyDays}
              onChange={(event) => onChange({ ...value, readOnlyDays: event.target.value })}
            />
          </Label>
          <div className="space-y-1">
            <Label>Затем</Label>
            <Select
              value={value.terminalState ?? 'unset'}
              onValueChange={(next) => {
                if (next === 'full_access' || next === 'read_only' || next === 'disabled') {
                  onChange({ ...value, terminalState: next });
                }
              }}
            >
              <SelectTrigger
                displayLabel={
                  value.terminalState === 'full_access'
                    ? 'Полный доступ'
                    : value.terminalState === 'read_only'
                      ? 'Только чтение'
                      : value.terminalState === 'disabled'
                        ? 'Выключено'
                        : 'Выберите состояние'
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset" disabled>
                  Выберите состояние
                </SelectItem>
                <SelectItem value="full_access">Полный доступ</SelectItem>
                <SelectItem value="read_only">Только чтение</SelectItem>
                <SelectItem value="disabled">Выключено</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CommercialConstructorClient() {
  const [state, setState] = useState<CommercialState>({
    tariffs: [],
    organizations: [],
    trialPolicy: null,
  });
  const [tariff, setTariff] = useState<TariffDraft>(emptyTariffDraft);
  const [reason, setReason] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [assignedTariffId, setAssignedTariffId] = useState('none');
  const [overrideMechanic, setOverrideMechanic] = useState<OrgMechanic>('booking');
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [overrideQuota, setOverrideQuota] = useState<TariffQuota | null>(null);
  const [overrideExpiresAt, setOverrideExpiresAt] = useState('');
  const [trialTariffId, setTrialTariffId] = useState('');
  const [trialDuration, setTrialDuration] = useState('');
  const [trialGrace, setTrialGrace] = useState('');
  const [trialStartEvent, setTrialStartEvent] = useState<TrialPolicy['startEvent']>('');
  const [postTrialBehavior, setPostTrialBehavior] =
    useState<TrialPolicy['postTrialBehavior'] | null>(null);
  const [postTrialTariffId, setPostTrialTariffId] = useState('none');
  const [trialActive, setTrialActive] = useState(false);
  const [extensionDays, setExtensionDays] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const response = await fetch('/api/admin/commercial', { cache: 'no-store' });
    const payload = (await response.json()) as CommercialState & { ok?: boolean; error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'commercial_state_load_failed');
    setState(payload);
  }, []);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    void loadState()
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить данные'),
      )
      .finally(() => setLoading(false));
  }, [loadState]);

  useEffect(() => {
    const policy = state.trialPolicy;
    if (!policy) {
      setTrialTariffId('');
      setTrialDuration('');
      setTrialGrace('');
      setTrialStartEvent('');
      setPostTrialBehavior(null);
      setPostTrialTariffId('none');
      setTrialActive(false);
      return;
    }
    setTrialTariffId(policy.tariffId);
    setTrialDuration(String(policy.durationDays));
    setTrialGrace(String(policy.graceDays));
    setTrialStartEvent(policy.startEvent);
    setPostTrialBehavior(policy.postTrialBehavior);
    setPostTrialTariffId(policy.postTrialTariffId ?? 'none');
    setTrialActive(policy.isActive);
  }, [state.trialPolicy]);

  const selectedOrganization = useMemo(
    () => state.organizations.find((organization) => organization.id === organizationId) ?? null,
    [organizationId, state.organizations],
  );
  const selectedManualTariffId = assignedTariffId === 'none' ? null : assignedTariffId;
  const manualAssignmentChanged = Boolean(
    selectedOrganization && selectedManualTariffId !== selectedOrganization.manualTariffId,
  );
  const assignmentEndsTrial = Boolean(
    selectedOrganization?.trial && selectedOrganization.trial.status !== 'ended',
  );
  const canStartTrial = Boolean(
    selectedOrganization && selectedOrganization.trial === null && state.trialPolicy?.isActive,
  );
  const canExtendTrial = Boolean(
    selectedOrganization?.trial?.status === 'active' &&
    Date.parse(selectedOrganization.trial.endsAt) > Date.now() &&
    Number.isSafeInteger(Number(extensionDays)) &&
    Number(extensionDays) > 0,
  );

  useEffect(() => {
    setAssignedTariffId(selectedOrganization?.manualTariffId ?? 'none');
  }, [selectedOrganization]);

  useEffect(() => {
    const current = selectedOrganization?.overrides.find(
      (override) => override.mechanic === overrideMechanic,
    );
    setOverrideEnabled(current?.enabled ?? true);
    setOverrideQuota(current?.quota ?? null);
    setOverrideExpiresAt(current?.expiresAt ? current.expiresAt.slice(0, 16) : '');
  }, [overrideMechanic, selectedOrganization]);

  async function mutate(
    body: Record<string, unknown>,
    success: string | ((result: CommercialMutationResult | undefined) => string),
  ) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/commercial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as CommercialMutationResponse;
      if (!response.ok) throw new Error(payload.error ?? 'commercial_operation_failed');
      await loadState();
      setMessage(typeof success === 'function' ? success(payload.result) : success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  }

  async function saveTariff(event: FormEvent) {
    event.preventDefault();
    const price = tariff.priceRub.trim() ? Math.round(Number(tariff.priceRub) * 100) : null;
    let systemAccessPolicy: AccessLifecyclePolicy | null;
    let mechanicAccessPolicies: MechanicAccessPolicyMap;
    try {
      systemAccessPolicy = accessPolicyFromDraft(tariff.systemAccessPolicy);
      mechanicAccessPolicies = Object.fromEntries(
        Object.entries(tariff.mechanicAccessPolicies).map(([mechanic, policy]) => [
          mechanic,
          accessPolicyFromDraft(policy)!,
        ]),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Проверьте лестницу доступа');
      return;
    }
    const input = {
      name: tariff.name,
      description: tariff.description,
      priceMinor: Number.isFinite(price) ? price : null,
      currency: price === null ? null : 'RUB',
      billingPeriod: tariff.billingPeriod,
      mechanics: tariff.mechanics,
      quotas: tariff.quotas,
      systemAccessPolicy,
      mechanicAccessPolicies,
      includedSeats: nullableNonnegativeInteger(tariff.includedSeats),
      includedSeatsWarningAtPercent: nullableNonnegativeInteger(
        tariff.includedSeatsWarningAtPercent,
      ),
      isActive: tariff.isActive,
    };
    await mutate(
      tariff.id
        ? { action: 'update_tariff', tariffId: tariff.id, tariff: input, reason }
        : { action: 'create_tariff', tariff: input, reason },
      tariff.id ? 'Тариф обновлён' : 'Тариф создан',
    );
    setReason('');
    if (!tariff.id) setTariff(emptyTariffDraft());
  }

  if (loading) {
    return <p role="status">Загрузка коммерческих настроек…</p>;
  }

  if (loadError) {
    return (
      <DoctorSection className="space-y-3" role="alert">
        <p>Не удалось загрузить коммерческие настройки: {loadError}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setLoading(true);
            setLoadError(null);
            void loadState()
              .catch((error: unknown) =>
                setLoadError(
                  error instanceof Error ? error.message : 'Не удалось загрузить данные',
                ),
              )
              .finally(() => setLoading(false));
          }}
        >
          Повторить
        </Button>
      </DoctorSection>
    );
  }

  return (
    <Tabs defaultValue="tariffs" className="space-y-3">
      <TabsList>
        <TabsTrigger value="tariffs">Тарифы</TabsTrigger>
        <TabsTrigger value="organizations">Организации</TabsTrigger>
        <TabsTrigger value="trial">Триал</TabsTrigger>
      </TabsList>
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}

      <TabsContent
        value="tariffs"
        className="grid gap-3 xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]"
      >
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Созданные тарифы</DoctorSectionTitle>
          </DoctorSectionHeader>
          <div className="divide-y divide-border/70">
            {state.tariffs.length === 0 ? (
              <p className="px-[18px] py-3 text-sm text-muted-foreground">Тарифы ещё не созданы.</p>
            ) : null}
            {state.tariffs.map((item) => (
              <button
                type="button"
                key={item.id}
                className="flex w-full items-center justify-between gap-3 px-[18px] py-3 text-left text-base font-normal hover:bg-muted/50"
                onClick={() => setTariff(tariffToDraft(item))}
              >
                <span>{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.isActive ? 'Активен' : 'Архив'}
                </span>
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => setTariff(emptyTariffDraft())}>
            Новый тариф
          </Button>
        </DoctorSection>

        <DoctorSection>
          <form className="space-y-4" onSubmit={saveTariff}>
            <DoctorSectionHeader>
              <DoctorSectionTitle>
                {tariff.id ? 'Редактирование тарифа' : 'Новый тариф'}
              </DoctorSectionTitle>
            </DoctorSectionHeader>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="tariff-name">Название</Label>
                <Input
                  id="tariff-name"
                  value={tariff.name}
                  onChange={(event) => setTariff({ ...tariff, name: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tariff-price">Цена, ₽</Label>
                <Input
                  id="tariff-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tariff.priceRub}
                  onChange={(event) => setTariff({ ...tariff, priceRub: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Период</Label>
                <Select
                  value={tariff.billingPeriod}
                  onValueChange={(value) => {
                    if (value) setTariff({ ...tariff, billingPeriod: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">День</SelectItem>
                    <SelectItem value="month">Месяц</SelectItem>
                    <SelectItem value="year">Год</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tariff-seats">Мест специалистов</Label>
                <Input
                  id="tariff-seats"
                  type="number"
                  min="0"
                  value={tariff.includedSeats}
                  onChange={(event) => setTariff({ ...tariff, includedSeats: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tariff-seats-warning">Предупреждать с, %</Label>
                <Input
                  id="tariff-seats-warning"
                  type="number"
                  min="0"
                  max="100"
                  value={tariff.includedSeatsWarningAtPercent}
                  onChange={(event) =>
                    setTariff({
                      ...tariff,
                      includedSeatsWarningAtPercent: event.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tariff-description">Описание</Label>
              <Textarea
                id="tariff-description"
                value={tariff.description}
                onChange={(event) => setTariff({ ...tariff, description: event.target.value })}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {CONSTRUCTOR_MECHANICS.map((mechanic) => {
                return (
                  <div key={mechanic} className="space-y-2 rounded-xl border border-border/70 p-3">
                    <Label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={tariff.mechanics[mechanic]}
                        onCheckedChange={(checked) =>
                          setTariff((current) => ({
                            ...current,
                            mechanics: { ...current.mechanics, [mechanic]: checked === true },
                          }))
                        }
                      />
                      {MECHANIC_REGISTRY[mechanic].label}
                    </Label>
                  </div>
                );
              })}
              <div className="space-y-2 rounded-xl border border-border/70 p-3">
                <Label>Файлы пациентов</Label>
                <NumericLimitEditor
                  label="Файлы пациентов"
                  unit="bytes"
                  quota={tariff.quotas.files ?? null}
                  onChange={(nextQuota) => {
                    if (nextQuota && nextQuota.unit !== 'bytes') return;
                    setTariff((current) => ({
                      ...current,
                      quotas: { ...current.quotas, files: nextQuota ?? undefined },
                    }));
                  }}
                />
              </div>
              {(['patient_count', 'branches'] as const).map((mechanic) => (
                <div
                  key={mechanic}
                  className="space-y-2 rounded-xl border border-border/70 p-3"
                >
                  <Label>{MECHANIC_REGISTRY[mechanic].label}</Label>
                  <NumericLimitEditor
                    label={MECHANIC_REGISTRY[mechanic].label}
                    unit="items"
                    quota={tariff.quotas[mechanic] ?? null}
                    onChange={(nextQuota) => {
                      if (nextQuota && nextQuota.unit !== 'items') return;
                      setTariff((current) => ({
                        ...current,
                        quotas: { ...current.quotas, [mechanic]: nextQuota ?? undefined },
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
            <AccessPolicyEditor
              title="Доступ к системе"
              value={tariff.systemAccessPolicy}
              onChange={(systemAccessPolicy) =>
                setTariff((current) => ({ ...current, systemAccessPolicy }))
              }
            />
            <div className="grid gap-2 md:grid-cols-2">
              {POLICY_MECHANICS.map((mechanic) => (
                <AccessPolicyEditor
                  key={mechanic}
                  title={MECHANIC_REGISTRY[mechanic].label}
                  value={tariff.mechanicAccessPolicies[mechanic] ?? null}
                  onChange={(policy) =>
                    setTariff((current) => {
                      const mechanicAccessPolicies = { ...current.mechanicAccessPolicies };
                      if (policy) mechanicAccessPolicies[mechanic] = policy;
                      else delete mechanicAccessPolicies[mechanic];
                      return { ...current, mechanicAccessPolicies };
                    })
                  }
                />
              ))}
            </div>
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={tariff.isActive}
                onCheckedChange={(checked) => setTariff({ ...tariff, isActive: checked === true })}
              />
              Активный тариф
            </Label>
            <div className="space-y-1">
              <Label htmlFor="tariff-reason">Причина изменения (необязательно)</Label>
              <Input
                id="tariff-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} type="submit">
                {tariff.id ? 'Сохранить' : 'Создать'}
              </Button>
              {tariff.id ? (
                <Button
                  disabled={busy}
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void mutate(
                      { action: 'archive_tariff', tariffId: tariff.id, reason },
                      'Тариф отправлен в архив',
                    )
                  }
                >
                  В архив
                </Button>
              ) : null}
            </div>
          </form>
        </DoctorSection>
      </TabsContent>

      <TabsContent value="organizations" className="grid gap-3 lg:grid-cols-2">
        <DoctorSection className="space-y-4">
          <DoctorSectionHeader>
            <DoctorSectionTitle>Тариф организации</DoctorSectionTitle>
          </DoctorSectionHeader>
          {state.organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Организации ещё не созданы.</p>
          ) : null}
          <div className="space-y-1">
            <Label>Организация</Label>
            <Select
              value={organizationId}
              onValueChange={(value) => {
                if (value) setOrganizationId(value);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите организацию" />
              </SelectTrigger>
              <SelectContent>
                {state.organizations.map((organization) => (
                  <SelectItem key={organization.id} value={organization.id}>
                    {organization.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    : (state.tariffs.find((item) => item.id === assignedTariffId)?.name ?? '')
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без ручного тарифа</SelectItem>
                {state.tariffs
                  .filter((item) => item.isActive)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {selectedOrganization ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>
                Доступ:{' '}
                {COMMERCIAL_LIFECYCLE_LABELS[selectedOrganization.effectiveAccess.lifecycle]}
              </p>
              <p>
                Тариф доступа:{' '}
                {state.tariffs.find(
                  (item) => item.id === selectedOrganization.effectiveAccess.tariffId,
                )?.name ?? 'не назначен'}
              </p>
              {selectedOrganization.trial ? (
                <>
                  <p>Статус триала: {TRIAL_STATUS_LABELS[selectedOrganization.trial.status]}</p>
                  <p>
                    Тариф триала:{' '}
                    {state.tariffs.find((item) => item.id === selectedOrganization.trial?.tariffId)
                      ?.name ?? 'не найден'}
                  </p>
                  <p>
                    До {new Date(selectedOrganization.trial.endsAt).toLocaleString('ru-RU')}, grace
                    до {new Date(selectedOrganization.trial.graceEndsAt).toLocaleString('ru-RU')}
                  </p>
                </>
              ) : (
                <p>Триал не запускался.</p>
              )}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="organization-reason">Причина (необязательно)</Label>
            <Input
              id="organization-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <Button
            disabled={busy || !organizationId || !manualAssignmentChanged}
            onClick={() =>
              void mutate(
                {
                  action: 'assign_tariff',
                  organizationId,
                  tariffId: selectedManualTariffId,
                  reason,
                },
                'Тариф организации изменён',
              )
            }
          >
            {assignmentEndsTrial ? 'Завершить триал и назначить' : 'Назначить'}
          </Button>
        </DoctorSection>
        <DoctorSection className="space-y-4">
          <DoctorSectionHeader>
            <DoctorSectionTitle>Исключение организации</DoctorSectionTitle>
          </DoctorSectionHeader>
          <div className="space-y-1">
            <Label>Механика</Label>
            <Select
              value={overrideMechanic}
              onValueChange={(value) => {
                if (value) {
                  setOverrideMechanic(value);
                  setOverrideQuota(null);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OVERRIDABLE_MECHANICS.map((mechanic) => (
                  <SelectItem key={mechanic} value={mechanic}>
                    {MECHANIC_REGISTRY[mechanic].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Label className="flex items-center gap-2">
            <Checkbox
              checked={overrideEnabled}
              onCheckedChange={(checked) => setOverrideEnabled(checked === true)}
            />
            Разрешено
          </Label>
          {MECHANIC_REGISTRY[overrideMechanic].class === 'объём' ||
          MECHANIC_REGISTRY[overrideMechanic].class === 'запас' ? (
            <div className="space-y-1">
              <Label>{MECHANIC_REGISTRY[overrideMechanic].label} для организации</Label>
              <NumericLimitEditor
                label={`${MECHANIC_REGISTRY[overrideMechanic].label} для организации`}
                unit={
                  MECHANIC_REGISTRY[overrideMechanic].class === 'объём' ? 'bytes' : 'items'
                }
                quota={overrideQuota}
                onChange={setOverrideQuota}
              />
            </div>
          ) : null}
          {selectedOrganization ? (
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Текущие исключения:</p>
              {selectedOrganization.overrides.length === 0 ? (
                <p>Нет исключений.</p>
              ) : (
                selectedOrganization.overrides.map((override) => (
                  <p key={override.id}>
                    {MECHANIC_REGISTRY[override.mechanic as OrgMechanic]?.label ??
                      override.mechanic}
                    : {override.enabled ? 'разрешено' : 'запрещено'}; действует до{' '}
                    {override.expiresAt
                      ? new Date(override.expiresAt).toLocaleString('ru-RU')
                      : 'без срока'}
                  </p>
                ))
              )}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="override-expires">Действует до (необязательно)</Label>
            <Input
              id="override-expires"
              type="datetime-local"
              value={overrideExpiresAt}
              onChange={(event) => setOverrideExpiresAt(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !organizationId}
              onClick={() =>
                void mutate(
                  {
                    action: 'upsert_override',
                    organizationId,
                    mechanic: overrideMechanic,
                    enabled: overrideEnabled,
                    quota: overrideQuota,
                    expiresAt: overrideExpiresAt ? new Date(overrideExpiresAt).toISOString() : null,
                    reason,
                  },
                  'Исключение сохранено',
                )
              }
            >
              Сохранить исключение
            </Button>
            <Button
              variant="outline"
              disabled={busy || !organizationId}
              onClick={() =>
                void mutate(
                  { action: 'delete_override', organizationId, mechanic: overrideMechanic, reason },
                  'Исключение удалено',
                )
              }
            >
              Удалить
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 border-t border-border/70 pt-3">
            <Button
              variant="outline"
              disabled={busy || !organizationId || !canStartTrial}
              onClick={() =>
                void mutate({ action: 'start_trial', organizationId, reason }, (result) =>
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
            <div className="space-y-1">
              <Label htmlFor="extension-days">Продлить, дней</Label>
              <Input
                id="extension-days"
                className="w-28"
                type="number"
                min="1"
                value={extensionDays}
                onChange={(event) => setExtensionDays(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || !organizationId || !canExtendTrial}
              onClick={() =>
                void mutate(
                  { action: 'extend_trial', organizationId, days: Number(extensionDays), reason },
                  'Триал продлён',
                )
              }
            >
              Продлить
            </Button>
          </div>
        </DoctorSection>
      </TabsContent>

      <TabsContent value="trial">
        <DoctorSection>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!postTrialBehavior) {
                setMessage('Выберите действие после триала');
                return;
              }
              void mutate(
                {
                  action: 'set_trial_policy',
                  policy: {
                    tariffId: trialTariffId,
                    durationDays: Number(trialDuration),
                    graceDays: Number(trialGrace),
                    startEvent: trialStartEvent,
                    postTrialBehavior,
                    postTrialTariffId:
                      postTrialBehavior === 'tariff' && postTrialTariffId !== 'none'
                        ? postTrialTariffId
                        : null,
                    isActive: trialActive,
                  },
                  reason,
                },
                'Правило триала сохранено',
              );
            }}
          >
            <DoctorSectionHeader className="md:col-span-2">
              <DoctorSectionTitle>Правило для новых организаций</DoctorSectionTitle>
            </DoctorSectionHeader>
            <div className="space-y-1">
              <Label>Тариф триала</Label>
              <Select
                value={trialTariffId}
                onValueChange={(value) => {
                  if (value) setTrialTariffId(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тариф" />
                </SelectTrigger>
                <SelectContent>
                  {state.tariffs
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="trial-start-event">Событие старта</Label>
              <Input
                id="trial-start-event"
                value={trialStartEvent}
                required
                onChange={(event) => setTrialStartEvent(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trial-duration">Триал, дней</Label>
              <Input
                id="trial-duration"
                type="number"
                min="1"
                value={trialDuration}
                onChange={(event) => setTrialDuration(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="trial-grace">Льготный период, дней</Label>
              <Input
                id="trial-grace"
                type="number"
                min="0"
                value={trialGrace}
                onChange={(event) => setTrialGrace(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>После триала</Label>
              <Select
                value={postTrialBehavior ?? 'unset'}
                onValueChange={(value) => {
                  if (value === 'read_only' || value === 'blocked' || value === 'tariff') {
                    setPostTrialBehavior(value);
                  }
                }}
              >
                <SelectTrigger
                  displayLabel={
                    postTrialBehavior === 'read_only'
                      ? 'Только чтение'
                      : postTrialBehavior === 'blocked'
                        ? 'Заблокировать'
                        : postTrialBehavior === 'tariff'
                          ? 'Другой тариф'
                          : 'Выберите действие'
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset" disabled>
                    Выберите действие
                  </SelectItem>
                  <SelectItem value="read_only">Только чтение</SelectItem>
                  <SelectItem value="blocked">Заблокировать</SelectItem>
                  <SelectItem value="tariff">Другой тариф</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {postTrialBehavior === 'tariff' ? (
              <div className="space-y-1">
                <Label>Тариф после триала</Label>
                <Select
                  value={postTrialTariffId}
                  onValueChange={(value) => {
                    if (value) setPostTrialTariffId(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тариф" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.tariffs
                      .filter((item) => item.isActive)
                      .map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <Label className="flex items-center gap-2">
              <Checkbox
                checked={trialActive}
                onCheckedChange={(checked) => setTrialActive(checked === true)}
              />
              Правило активно
            </Label>
            <div className="space-y-1">
              <Label htmlFor="trial-reason">Причина изменения (необязательно)</Label>
              <Input
                id="trial-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={busy || !trialTariffId || !trialStartEvent.trim() || !postTrialBehavior}
              >
                Сохранить правило
              </Button>
            </div>
          </form>
        </DoctorSection>
      </TabsContent>
    </Tabs>
  );
}
