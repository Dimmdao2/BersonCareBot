'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ACCESS_NOTIFICATION_CONDITIONS,
  MECHANIC_REGISTRY,
  MECHANICS,
  quotaMechanicSupportsWarning,
  type AccessLifecyclePolicy,
  type AccessNotificationCondition,
  type AccessTerminalState,
  type DowngradePolicyMap,
  type MailingTemplate,
  type MechanicDowngradePolicy,
  type OrgMechanic,
  type RegistrationTariffPolicy,
  type PaidPeriodPolicy,
  type BillingPeriodOption,
  type Tariff,
  type TariffQuota,
  type TariffQuotaMap,
  type TrialPolicy,
} from '@/modules/org-entitlements/types';
import type { PlatformOrganizationSummary } from '@/modules/org-entitlements/ports';
import {
  ACCESS_NOTIFICATION_VARIABLES,
  renderAccessNotification,
} from '@/modules/org-entitlements/accessNotifications';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { DataLoadFailureNotice } from '@/shared/ui/doctor/DataLoadFailureNotice';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Checkbox } from '@/shared/ui/doctor/primitives/checkbox';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import { MarkdownContent } from '@/shared/ui/doctor/markdown/MarkdownContent';
import { MarkdownEditor } from '@/shared/ui/doctor/markdown/MarkdownEditor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/doctor/primitives/tabs';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';

/** §T3 preview — sample values so an admin sees a rendered letter, not raw `{{тариф}}` tokens. */
const MAILING_PREVIEW_VARIABLES: Record<string, string> = {
  клиника: 'Демоклиника',
  тариф: 'Стандарт',
  сумма: '4 900',
  дата_начала_периода_автооплаты: '01.09.2026',
};

type CommercialState = {
  tariffs: Tariff[];
  organizations: PlatformOrganizationSummary[];
  trialPolicy: TrialPolicy | null;
  registrationTariffPolicy: RegistrationTariffPolicy;
  billingPeriods: BillingPeriodOption[];
  paidPeriodPolicy: PaidPeriodPolicy | null;
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
  /** §5a item 5.1 — empty means overage past includedSeats stays hard-blocked (§5.2, unchanged). */
  additionalSeatPriceRub: string;
  /**
   * Т8 — exact discounted price for this tariff's discount-payment window. No editor in this
   * constructor yet (a separate slice); carried through unchanged so re-saving an existing tariff
   * here never silently wipes it.
   */
  discountedPriceMinor: number | null;
  isActive: boolean;
  mechanics: Record<OrgMechanic, boolean>;
  quotas: TariffQuotaMap;
  systemAccessPolicy: AccessPolicyDraft | null;
  downgradePolicies: DowngradePolicyMap;
  /** §T3 — this tariff's marketing letters, edited on the «Рассылки» tab. */
  mailingTemplates: MailingTemplate[];
};

type AccessNotificationDraft = {
  offsetDays: string;
  condition: AccessNotificationCondition;
  /** §T3 — the row points at a template on this tariff; null means none chosen yet. */
  templateId: string | null;
  /**
   * Carried through unedited: a pre-Т3 row's already-shipped text when `templateId` is null (see
   * `AccessNotificationRule.template` in types.ts), overwritten server-side once a template is
   * chosen. Never rendered as an editable field — the letter itself is written on the «Рассылки» tab.
   */
  template: string;
};

type AccessPolicyDraft = {
  graceDays: string;
  readOnlyDays: string;
  notifications: AccessNotificationDraft[];
  terminalState: AccessTerminalState | null;
};

// Т2/Т7 (owner 04.08) — три новых триггера ради маркетинга (старт триала, завершение триала,
// регистрация) и два льготных (срабатывают только тем, кто ещё не купил после завершения триала).
const NOTIFICATION_CONDITION_LABELS: Record<AccessNotificationCondition, string> = {
  payment_succeeded: 'Успешная оплата',
  payment_failed: 'Ошибка оплаты',
  registration: 'Регистрация (первый вход в кабинет)',
  trial_started: 'Старт триала',
  trial_ended: 'Завершение триала',
  discount_period_started: 'Льготный период начат',
  discount_period_ended: 'Льготный период завершён',
};

const CONSTRUCTOR_MECHANICS = MECHANICS.filter(
  (mechanic) => MECHANIC_REGISTRY[mechanic].class === 'возможность',
);
const OVERRIDABLE_MECHANICS = MECHANICS.filter(
  (mechanic) => MECHANIC_REGISTRY[mechanic].class !== 'никогда',
);
// §5a stage 4b.3 — "места" has no downgrade state (seat overage is billed, not blocked; owner
// 30.07, #4a.1), so it gets no downgrade-policy knob at all.
const DOWNGRADE_MECHANICS = OVERRIDABLE_MECHANICS.filter(
  (mechanic) => MECHANIC_REGISTRY[mechanic].class !== 'места',
);
const DOWNGRADE_POLICY_OPTIONS: Record<
  'запас' | 'объём' | 'возможность',
  Array<{ value: MechanicDowngradePolicy; label: string }>
> = {
  запас: [
    { value: 'block', label: 'Не давать переход' },
    { value: 'freeze_growth', label: 'Дать переход, заморозить рост' },
  ],
  объём: [
    { value: 'block', label: 'Не давать переход' },
    { value: 'freeze_growth', label: 'Дать переход, заморозить рост' },
  ],
  возможность: [
    { value: 'block', label: 'Не давать переход' },
    { value: 'disable_immediately', label: 'Выключить сразу' },
    { value: 'read_only', label: 'Оставить только чтение' },
  ],
};

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
    // Owner 31.07: «при создании тарифа по умолчанию пусть ставится одно — это разумный
    // минимум». A prefilled value the owner sees and changes, not a runtime substitution.
    includedSeats: '1',
    additionalSeatPriceRub: '',
    discountedPriceMinor: null,
    isActive: true,
    mechanics: emptyMechanics(),
    quotas: {},
    systemAccessPolicy: null,
    downgradePolicies: {},
    mailingTemplates: [],
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
    additionalSeatPriceRub:
      tariff.additionalSeatPriceMinor === null ? '' : String(tariff.additionalSeatPriceMinor / 100),
    discountedPriceMinor: tariff.discountedPriceMinor,
    isActive: tariff.isActive,
    mechanics: Object.fromEntries(
      CONSTRUCTOR_MECHANICS.map((mechanic) => [mechanic, tariff.mechanics[mechanic] === true]),
    ) as Record<OrgMechanic, boolean>,
    quotas: tariff.quotas,
    systemAccessPolicy: tariff.systemAccessPolicy
      ? accessPolicyToDraft(tariff.systemAccessPolicy)
      : null,
    downgradePolicies: tariff.downgradePolicies,
    mailingTemplates: tariff.mailingTemplates,
  };
}

function accessPolicyToDraft(policy: AccessLifecyclePolicy): AccessPolicyDraft {
  return {
    graceDays: String(policy.graceDays),
    readOnlyDays: String(policy.readOnlyDays),
    notifications: (policy.notifications ?? []).map((rule) => ({
      offsetDays: String(rule.offsetDays),
      condition: rule.condition,
      templateId: rule.templateId ?? null,
      template: rule.template,
    })),
    terminalState: policy.terminalState,
  };
}

function emptyAccessPolicyDraft(): AccessPolicyDraft {
  return { graceDays: '', readOnlyDays: '', notifications: [], terminalState: null };
}

function accessPolicyFromDraft(draft: AccessPolicyDraft | null): AccessLifecyclePolicy | null {
  if (!draft) return null;
  const graceDays = nullableNonnegativeInteger(draft.graceDays);
  const readOnlyDays = nullableNonnegativeInteger(draft.readOnlyDays);
  if (graceDays === null || readOnlyDays === null || draft.terminalState === null) {
    throw new Error('Заполните все поля лестницы доступа');
  }
  const notifications = draft.notifications.map((rule) => {
    const offsetDays = Number(rule.offsetDays);
    if (!rule.offsetDays.trim() || !Number.isSafeInteger(offsetDays)) {
      throw new Error('В каждом уведомлении заполните срок');
    }
    return {
      offsetDays,
      condition: rule.condition,
      templateId: rule.templateId,
      template: rule.template,
    };
  });
  return { graceDays, readOnlyDays, notifications, terminalState: draft.terminalState };
}

function nullableNonnegativeInteger(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

const ACCESS_TERMINAL_STATE_LABELS: Record<AccessTerminalState, string> = {
  read_only: 'только чтение',
  disabled: 'выключено',
};

/**
 * §5a item 2.6a — `warnable` says whether this mechanic has an early-warning threshold at all.
 * The owner named exactly two (patients and file volume); branches have none, so the field is not
 * rendered rather than rendered and ignored.
 */
function NumericLimitEditor({
  label,
  unit,
  warnable,
  quota,
  onChange,
}: {
  label: string;
  unit: TariffQuota['unit'];
  warnable: boolean;
  quota: TariffQuota | null;
  onChange: (quota: TariffQuota | null) => void;
}) {
  function changeKind(kind: 'none' | TariffQuota['kind']) {
    if (kind === 'none') {
      onChange(null);
      return;
    }
    const limit = kind === 'numeric' ? (quota?.limit ?? 0) : null;
    onChange(
      warnable
        ? { kind, limit, unit, warningAtPercent: quota?.warningAtPercent ?? null }
        : ({ kind, limit, unit } as TariffQuota),
    );
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
      {quota && warnable ? (
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
            } as TariffQuota)
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
              aria-label={`${title}: Терпение: дней`}
              value={value.graceDays}
              onChange={(event) => onChange({ ...value, graceDays: event.target.value })}
            />
          </Label>
          <Label className="space-y-1">
            <span>Только чтение: дней</span>
            <Input
              type="number"
              min="0"
              required
              aria-label={`${title}: Только чтение: дней`}
              value={value.readOnlyDays}
              onChange={(event) => onChange({ ...value, readOnlyDays: event.target.value })}
            />
          </Label>
          <div className="space-y-1">
            <Label>Затем</Label>
            <Select
              value={value.terminalState ?? 'unset'}
              onValueChange={(next) => {
                if (next === 'read_only' || next === 'disabled') {
                  onChange({ ...value, terminalState: next });
                }
              }}
            >
              <SelectTrigger
                aria-label={`${title}: Затем`}
                displayLabel={
                  value.terminalState === 'read_only'
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

/**
 * §5a item 2.6a — уведомления лестницы: столько строк, сколько заведёт владелец. Каждая строка —
 * срок относительно окончания периода, условие и текст с переменными вида `{{тариф}}`.
 */
function AccessNotificationsEditor({
  title,
  rows,
  templates,
  onChange,
}: {
  title: string;
  rows: AccessNotificationDraft[];
  /** §T3 — this tariff's letters; the row picks one instead of embedding text. */
  templates: MailingTemplate[];
  onChange: (rows: AccessNotificationDraft[]) => void;
}) {
  function update(index: number, patch: Partial<AccessNotificationDraft>) {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Уведомления</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([
              ...rows,
              { offsetDays: '', condition: 'payment_failed', templateId: null, template: '' },
            ])
          }
        >
          Добавить уведомление
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Уведомлений нет.</p>
      ) : null}
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
          <Label className="space-y-1">
            <span>Срок, дней от окончания периода</span>
            <Input
              type="number"
              aria-label={`${title}: уведомление ${index + 1}: срок`}
              placeholder="−3 до, 5 после"
              value={row.offsetDays}
              onChange={(event) => update(index, { offsetDays: event.target.value })}
            />
          </Label>
          <div className="space-y-1">
            <Label>Условие</Label>
            <Select
              value={row.condition}
              onValueChange={(next) => {
                if (next && (ACCESS_NOTIFICATION_CONDITIONS as readonly string[]).includes(next)) {
                  update(index, { condition: next as AccessNotificationCondition });
                }
              }}
            >
              <SelectTrigger
                aria-label={`${title}: уведомление ${index + 1}: условие`}
                displayLabel={NOTIFICATION_CONDITION_LABELS[row.condition]}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCESS_NOTIFICATION_CONDITIONS.map((condition) => (
                  <SelectItem key={condition} value={condition}>
                    {NOTIFICATION_CONDITION_LABELS[condition]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Шаблон письма</Label>
            <Select
              value={row.templateId ?? 'none'}
              onValueChange={(next) => {
                if (!next) return;
                update(index, { templateId: next === 'none' ? null : next });
              }}
            >
              <SelectTrigger
                aria-label={`${title}: уведомление ${index + 1}: шаблон`}
                displayLabel={
                  row.templateId
                    ? (templates.find((template) => template.id === row.templateId)?.name ??
                      'Шаблон не найден')
                    : 'Не выбран'
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не выбран</SelectItem>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Текст письма правится на вкладке «Рассылки».
            </p>
            {!row.templateId && row.template.trim() ? (
              <p className="text-xs text-muted-foreground">
                Есть старый текст без шаблона (сохранён как есть): «{row.template}»
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange(rows.filter((_, position) => position !== index))}
            >
              Удалить уведомление {index + 1}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DowngradePolicyEditor({
  mechanic,
  value,
  onChange,
}: {
  mechanic: OrgMechanic;
  value: MechanicDowngradePolicy | null;
  onChange: (value: MechanicDowngradePolicy) => void;
}) {
  const options = DOWNGRADE_POLICY_OPTIONS[MECHANIC_REGISTRY[mechanic].class as 'запас' | 'объём' | 'возможность'];
  const title = MECHANIC_REGISTRY[mechanic].label;
  return (
    <div className="space-y-1 rounded-xl border border-border/70 p-3">
      <Label>{title}</Label>
      <Select value={value ?? 'unset'} onValueChange={(next) => onChange(next as MechanicDowngradePolicy)}>
        <SelectTrigger
          aria-label={`${title}: При переходе на меньший тариф`}
          displayLabel={options.find((option) => option.value === value)?.label ?? 'Не задано'}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unset" disabled>
            Не задано
          </SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CommercialConstructorClient() {
  const [state, setState] = useState<CommercialState>({
    tariffs: [],
    organizations: [],
    trialPolicy: null,
    registrationTariffPolicy: { tariffId: null },
    billingPeriods: [],
    paidPeriodPolicy: null,
  });
  const [tariff, setTariff] = useState<TariffDraft>(emptyTariffDraft);
  const [reason, setReason] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [assignedTariffId, setAssignedTariffId] = useState('none');
  const [overrideMechanic, setOverrideMechanic] = useState<OrgMechanic>('booking');
  const [overrideEnabled, setOverrideEnabled] = useState(true);
  const [overrideQuota, setOverrideQuota] = useState<TariffQuota | null>(null);
  const [overrideExpiresAt, setOverrideExpiresAt] = useState('');
  const [trialDuration, setTrialDuration] = useState('');
  const [trialDiscountWindow, setTrialDiscountWindow] = useState('');
  const [trialStartEvent, setTrialStartEvent] = useState<TrialPolicy['startEvent']>('');
  const [postTrialBehavior, setPostTrialBehavior] =
    useState<TrialPolicy['postTrialBehavior'] | null>(null);
  const [postTrialTariffId, setPostTrialTariffId] = useState('none');
  const [trialActive, setTrialActive] = useState(false);
  const [registrationTariffId, setRegistrationTariffId] = useState('none');
  const [postPaidPeriodBehavior, setPostPaidPeriodBehavior] =
    useState<PaidPeriodPolicy['postPaidPeriodBehavior'] | null>(null);
  const [postPaidPeriodTariffId, setPostPaidPeriodTariffId] = useState('none');
  const [paidPeriodPolicyActive, setPaidPeriodPolicyActive] = useState(true);
  const selectableBillingPeriods = useMemo(
    () => state.billingPeriods.filter((period) => period.isSelectable),
    [state.billingPeriods],
  );
  // §T3 — which of the current tariff's letters is open in the «Рассылки» tab editor.
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const response = await fetch('/api/admin/commercial', { cache: 'no-store' });
    const payload = (await response.json()) as CommercialState & { ok?: boolean; error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'commercial_state_load_failed');
    setState({
      tariffs: payload.tariffs ?? [],
      organizations: payload.organizations ?? [],
      trialPolicy: payload.trialPolicy ?? null,
      registrationTariffPolicy: payload.registrationTariffPolicy ?? { tariffId: null },
      billingPeriods: payload.billingPeriods ?? [],
      paidPeriodPolicy: payload.paidPeriodPolicy ?? null,
    });
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
      setTrialDuration('');
      setTrialDiscountWindow('');
      setTrialStartEvent('');
      setPostTrialBehavior(null);
      setPostTrialTariffId('none');
      setTrialActive(false);
      return;
    }
    setTrialDuration(String(policy.durationDays));
    setTrialDiscountWindow(String(policy.discountWindowDays));
    setTrialStartEvent(policy.startEvent);
    setPostTrialBehavior(policy.postTrialBehavior);
    setPostTrialTariffId(policy.postTrialTariffId ?? 'none');
    setTrialActive(policy.isActive);
  }, [state.trialPolicy]);

  useEffect(() => {
    const policy = state.paidPeriodPolicy;
    if (!policy) {
      setPostPaidPeriodBehavior(null);
      setPostPaidPeriodTariffId('none');
      setPaidPeriodPolicyActive(true);
      return;
    }
    setPostPaidPeriodBehavior(policy.postPaidPeriodBehavior);
    setPostPaidPeriodTariffId(policy.postPaidPeriodTariffId ?? 'none');
    setPaidPeriodPolicyActive(policy.isActive);
  }, [state.paidPeriodPolicy]);

  useEffect(() => {
    setRegistrationTariffId(state.registrationTariffPolicy?.tariffId ?? 'none');
  }, [state.registrationTariffPolicy]);

  // §T3 — switching the selected tariff leaves its editor for a letter that may not exist here.
  useEffect(() => {
    setSelectedTemplateId(null);
  }, [tariff.id]);

  const selectedMailingTemplate = useMemo(
    () => tariff.mailingTemplates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, tariff.mailingTemplates],
  );

  const selectedOrganization = useMemo(
    () => state.organizations.find((organization) => organization.id === organizationId) ?? null,
    [organizationId, state.organizations],
  );
  const selectedManualTariffId = assignedTariffId === 'none' ? null : assignedTariffId;
  const manualAssignmentChanged = Boolean(
    selectedOrganization &&
      (selectedManualTariffId !== selectedOrganization.manualTariffId ||
        selectedOrganization.scheduledTariff !== null),
  );
  const assignmentEndsTrial = Boolean(
    selectedOrganization?.trial && selectedOrganization.trial.status !== 'ended',
  );
  // #1069 Т3/Т5 (owner 03.08): the trial applies to whatever tariff the organization already has —
  // assign one first (above) before a trial can start.
  const canStartTrial = Boolean(
    selectedOrganization &&
      selectedOrganization.tariffId &&
      selectedOrganization.trial === null &&
      state.trialPolicy?.isActive,
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
    const additionalSeatPrice = tariff.additionalSeatPriceRub.trim()
      ? Math.round(Number(tariff.additionalSeatPriceRub) * 100)
      : null;
    let systemAccessPolicy: AccessLifecyclePolicy | null;
    try {
      systemAccessPolicy = accessPolicyFromDraft(tariff.systemAccessPolicy);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Проверьте лестницу доступа');
      return;
    }
    const input = {
      name: tariff.name,
      description: tariff.description,
      priceMinor: Number.isFinite(price) ? price : null,
      currency:
        price === null && additionalSeatPrice === null && tariff.discountedPriceMinor === null
          ? null
          : 'RUB',
      billingPeriod: tariff.billingPeriod,
      mechanics: tariff.mechanics,
      quotas: tariff.quotas,
      systemAccessPolicy,
      mechanicAccessPolicies: {},
      downgradePolicies: tariff.downgradePolicies,
      mailingTemplates: tariff.mailingTemplates,
      includedSeats: nullableNonnegativeInteger(tariff.includedSeats),
      additionalSeatPriceMinor: Number.isFinite(additionalSeatPrice) ? additionalSeatPrice : null,
      discountedPriceMinor: tariff.discountedPriceMinor,
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
    return (
      <DoctorSection>
        <p role="status" className="text-sm text-muted-foreground">
          Загружаем коммерческие настройки…
        </p>
      </DoctorSection>
    );
  }

  if (loadError) {
    return (
      <DoctorSection>
        <DataLoadFailureNotice
          title="Не удалось загрузить коммерческие настройки."
          digest="COMMERCIAL-SETTINGS"
          devMessage={loadError}
          onRetry={() => {
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
          retrying={loading}
        />
      </DoctorSection>
    );
  }

  return (
    <Tabs defaultValue="tariffs" className="space-y-3">
      <TabsList>
        <TabsTrigger value="tariffs">Тарифы</TabsTrigger>
        <TabsTrigger value="organizations">Организации</TabsTrigger>
        <TabsTrigger value="trial">Триал</TabsTrigger>
        <TabsTrigger value="notifications">Уведомления</TabsTrigger>
        <TabsTrigger value="mailings">Рассылки</TabsTrigger>
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
                    {selectableBillingPeriods.map((period) => (
                      <SelectItem key={period.code} value={period.code}>
                        {period.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="tariff-seats">Мест специалистов</Label>
                <Input
                  id="tariff-seats"
                  type="number"
                  min="0"
                  required
                  value={tariff.includedSeats}
                  onChange={(event) => setTariff({ ...tariff, includedSeats: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tariff-seat-overage-price">
                  Цена доп. места, ₽ (пусто — превышение запрещено)
                </Label>
                <Input
                  id="tariff-seat-overage-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={tariff.additionalSeatPriceRub}
                  onChange={(event) =>
                    setTariff({ ...tariff, additionalSeatPriceRub: event.target.value })
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
                  warnable={quotaMechanicSupportsWarning('files')}
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
                    warnable={quotaMechanicSupportsWarning(mechanic)}
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
              {DOWNGRADE_MECHANICS.map((mechanic) => (
                <DowngradePolicyEditor
                  key={mechanic}
                  mechanic={mechanic}
                  value={tariff.downgradePolicies[mechanic] ?? null}
                  onChange={(policy) =>
                    setTariff((current) => ({
                      ...current,
                      downgradePolicies: { ...current.downgradePolicies, [mechanic]: policy },
                    }))
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
              {selectedOrganization.scheduledTariff ? (
                <p>
                  Новый тариф:{' '}
                  {state.tariffs.find(
                    (item) => item.id === selectedOrganization.scheduledTariff?.tariffId,
                  )?.name ?? 'не найден'}{' '}
                  вступит {new Date(selectedOrganization.scheduledTariff.effectiveAt).toLocaleString('ru-RU')}
                </p>
              ) : null}
              {selectedOrganization.trial ? (
                <>
                  <p>Статус триала: {TRIAL_STATUS_LABELS[selectedOrganization.trial.status]}</p>
                  <p>
                    Тариф на триале:{' '}
                    {state.tariffs.find((item) => item.id === selectedOrganization.trial?.tariffId)
                      ?.name ?? 'не найден'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ⛔ УСТАРЕЛО → T5: отдельного «тарифа триала» нет — триал на первом тарифе
                    организации.
                  </p>
                  <p>До {new Date(selectedOrganization.trial.endsAt).toLocaleString('ru-RU')}</p>
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
                warnable={quotaMechanicSupportsWarning(overrideMechanic)}
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
          </div>
        </DoctorSection>
      </TabsContent>

      <TabsContent value="trial">
        <DoctorSection>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(
                {
                  action: 'set_registration_tariff_policy',
                  policy: {
                    tariffId: registrationTariffId === 'none' ? null : registrationTariffId,
                  },
                  reason,
                },
                'Стартовый тариф сохранён',
              );
            }}
          >
            <DoctorSectionHeader className="md:col-span-2">
              <DoctorSectionTitle>Стартовый тариф при регистрации</DoctorSectionTitle>
            </DoctorSectionHeader>
            <div className="space-y-1 md:col-span-2">
              <Label>Тариф, выдаваемый новой клинике при регистрации</Label>
              <Select
                value={registrationTariffId}
                onValueChange={(value) => {
                  if (value) setRegistrationTariffId(value);
                }}
              >
                <SelectTrigger
                  displayLabel={
                    registrationTariffId === 'none'
                      ? 'Не выдавать — человек выбирает тариф сам'
                      : (state.tariffs.find((item) => item.id === registrationTariffId)?.name ??
                        '')
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не выдавать — человек выбирает тариф сам</SelectItem>
                  {state.tariffs
                    .filter((item) => item.isActive)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Отдельная настройка от срока триала ниже. Пустое значение — человек сам выбирает
                первый тариф; при выборе или назначении первого тарифа действует правило триала.
              </p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy}>
                Сохранить стартовый тариф
              </Button>
            </div>
          </form>
        </DoctorSection>

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
                    durationDays: Number(trialDuration),
                    discountWindowDays: Number(trialDiscountWindow),
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
            <p className="text-sm text-muted-foreground md:col-span-2">
              Отдельная настройка от стартового тарифа выше. Срок триала не зависит от выбранного
              тарифа: первый раз — триал на том тарифе, который оказался первым (назначен или
              выбран); все последующие смены — сразу оплата.
            </p>
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
              <Label htmlFor="trial-grace">Льготный период на оплату со скидкой, дней</Label>
              <Input
                id="trial-grace"
                type="number"
                min="0"
                value={trialDiscountWindow}
                onChange={(event) => setTrialDiscountWindow(event.target.value)}
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
                disabled={busy || !trialStartEvent.trim() || !postTrialBehavior}
              >
                Сохранить правило
              </Button>
            </div>
          </form>
        </DoctorSection>

        <DoctorSection>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!postPaidPeriodBehavior) {
                setMessage('Выберите действие после оплаченного периода');
                return;
              }
              void mutate(
                {
                  action: 'set_paid_period_policy',
                  policy: {
                    postPaidPeriodBehavior,
                    postPaidPeriodTariffId:
                      postPaidPeriodBehavior === 'tariff' && postPaidPeriodTariffId !== 'none'
                        ? postPaidPeriodTariffId
                        : null,
                    isActive: paidPeriodPolicyActive,
                  },
                  reason,
                },
                'Правило после оплаты сохранено',
              );
            }}
          >
            <DoctorSectionHeader className="md:col-span-2">
              <DoctorSectionTitle>После завершения оплаченного периода</DoctorSectionTitle>
            </DoctorSectionHeader>
            <p className="text-sm text-muted-foreground md:col-span-2">
              Одна общая настройка для всех клиник, когда оплаченный период закончился и продления
              нет. Отдельно от правила «После триала» выше.
            </p>
            <div className="space-y-1 md:col-span-2">
              <Label>Действие</Label>
              <Select
                value={postPaidPeriodBehavior ?? 'unset'}
                onValueChange={(value) => {
                  if (value === 'read_only' || value === 'blocked' || value === 'tariff') {
                    setPostPaidPeriodBehavior(value);
                  }
                }}
              >
                <SelectTrigger
                  displayLabel={
                    postPaidPeriodBehavior === 'read_only'
                      ? 'Только чтение'
                      : postPaidPeriodBehavior === 'blocked'
                        ? 'Заблокировать'
                        : postPaidPeriodBehavior === 'tariff'
                          ? 'Перейти на другой тариф'
                          : undefined
                  }
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read_only">Только чтение</SelectItem>
                  <SelectItem value="blocked">Заблокировать</SelectItem>
                  <SelectItem value="tariff">Перейти на другой тариф</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {postPaidPeriodBehavior === 'tariff' ? (
              <div className="space-y-1 md:col-span-2">
                <Label>Тариф после неоплаты</Label>
                <Select
                  value={postPaidPeriodTariffId}
                  onValueChange={(value) => {
                    if (value) setPostPaidPeriodTariffId(value);
                  }}
                >
                  <SelectTrigger
                    displayLabel={
                      postPaidPeriodTariffId === 'none'
                        ? 'Выберите тариф'
                        : (state.tariffs.find((item) => item.id === postPaidPeriodTariffId)?.name ??
                          '')
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Выберите тариф</SelectItem>
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
            <Label className="flex items-center gap-2 md:col-span-2">
              <Checkbox
                checked={paidPeriodPolicyActive}
                onCheckedChange={(checked) => setPaidPeriodPolicyActive(checked === true)}
              />
              Правило активно
            </Label>
            <div className="md:col-span-2">
              <Button type="submit" disabled={busy || !postPaidPeriodBehavior}>
                Сохранить правило после оплаты
              </Button>
            </div>
          </form>
        </DoctorSection>
      </TabsContent>

      <TabsContent
        value="notifications"
        className="grid gap-3 xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]"
      >
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Тариф</DoctorSectionTitle>
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
                {tariff.id === item.id ? (
                  <span className="text-xs text-muted-foreground">Выбран</span>
                ) : null}
              </button>
            ))}
          </div>
        </DoctorSection>

        <DoctorSection>
          <form className="space-y-4" onSubmit={saveTariff}>
            <DoctorSectionHeader>
              <DoctorSectionTitle>
                Триггеры уведомлений{tariff.id ? ` — ${tariff.name}` : ''}
              </DoctorSectionTitle>
            </DoctorSectionHeader>
            {!tariff.id ? (
              <p className="text-sm text-muted-foreground">
                Выберите тариф слева, чтобы править его триггеры.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Срок, условие и какое письмо уходит. Сами письма правятся на вкладке
                  «Рассылки» — там полноценный редактор с картинками и форматированием.
                  Льготные триггеры («Льготный период начат/завершён») уходят только тем клиникам,
                  которые ещё не оплатили после триала.
                </p>
                {tariff.systemAccessPolicy ? (
                  <AccessNotificationsEditor
                    title="Доступ к системе"
                    rows={tariff.systemAccessPolicy.notifications}
                    templates={tariff.mailingTemplates}
                    onChange={(notifications) =>
                      setTariff((current) => ({
                        ...current,
                        systemAccessPolicy: current.systemAccessPolicy
                          ? { ...current.systemAccessPolicy, notifications }
                          : current.systemAccessPolicy,
                      }))
                    }
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    У тарифа не настроен доступ к системе — включите его во вкладке «Тарифы», затем
                    возвращайтесь сюда за текстами.
                  </p>
                )}
                <div className="space-y-1">
                  <Label htmlFor="notifications-reason">Причина изменения (необязательно)</Label>
                  <Input
                    id="notifications-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
                <Button disabled={busy} type="submit">
                  Сохранить
                </Button>
              </>
            )}
          </form>
        </DoctorSection>
      </TabsContent>

      <TabsContent
        value="mailings"
        className="grid gap-3 xl:grid-cols-[minmax(240px,0.7fr)_minmax(0,1.3fr)]"
      >
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Тариф</DoctorSectionTitle>
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
                {tariff.id === item.id ? (
                  <span className="text-xs text-muted-foreground">Выбран</span>
                ) : null}
              </button>
            ))}
          </div>
          {tariff.id ? (
            <>
              <DoctorSectionHeader>
                <DoctorSectionTitle>Письма — {tariff.name}</DoctorSectionTitle>
              </DoctorSectionHeader>
              <div className="divide-y divide-border/70">
                {tariff.mailingTemplates.length === 0 ? (
                  <p className="px-[18px] py-3 text-sm text-muted-foreground">Шаблонов ещё нет.</p>
                ) : null}
                {tariff.mailingTemplates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    className="flex w-full items-center justify-between gap-3 px-[18px] py-3 text-left text-base font-normal hover:bg-muted/50"
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <span>{template.name || 'Без названия'}</span>
                    {selectedTemplateId === template.id ? (
                      <span className="text-xs text-muted-foreground">Выбран</span>
                    ) : null}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const id = crypto.randomUUID();
                  setTariff((current) => ({
                    ...current,
                    mailingTemplates: [
                      ...current.mailingTemplates,
                      { id, name: '', subject: '', body: '' },
                    ],
                  }));
                  setSelectedTemplateId(id);
                }}
              >
                Новый шаблон
              </Button>
            </>
          ) : null}
        </DoctorSection>

        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>{selectedMailingTemplate ? 'Письмо' : 'Выберите письмо'}</DoctorSectionTitle>
          </DoctorSectionHeader>
          {!tariff.id ? (
            <p className="text-sm text-muted-foreground">Выберите тариф слева.</p>
          ) : !selectedMailingTemplate ? (
            <p className="text-sm text-muted-foreground">
              Выберите шаблон слева или создайте новый — это письмо для маркетинговой рассылки;
              привязать его к триггеру можно на вкладке «Уведомления».
            </p>
          ) : (
            <form className="space-y-4" onSubmit={saveTariff}>
              <div className="space-y-1">
                <Label htmlFor="mailing-template-name">
                  Название (для списка выше, получателю не видно)
                </Label>
                <Input
                  id="mailing-template-name"
                  value={selectedMailingTemplate.name}
                  onChange={(event) =>
                    setTariff((current) => ({
                      ...current,
                      mailingTemplates: current.mailingTemplates.map((template) =>
                        template.id === selectedMailingTemplate.id
                          ? { ...template, name: event.target.value }
                          : template,
                      ),
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mailing-template-subject">Тема письма</Label>
                <Input
                  id="mailing-template-subject"
                  value={selectedMailingTemplate.subject}
                  onChange={(event) =>
                    setTariff((current) => ({
                      ...current,
                      mailingTemplates: current.mailingTemplates.map((template) =>
                        template.id === selectedMailingTemplate.id
                          ? { ...template, subject: event.target.value }
                          : template,
                      ),
                    }))
                  }
                />
              </div>
              <MarkdownEditor
                name={`mailing-template-${selectedMailingTemplate.id}-body`}
                label="Текст письма"
                helpText="Форматирование и картинки, как в рассылках врача."
                value={selectedMailingTemplate.body}
                onChange={(next) =>
                  setTariff((current) => ({
                    ...current,
                    mailingTemplates: current.mailingTemplates.map((template) =>
                      template.id === selectedMailingTemplate.id ? { ...template, body: next } : template,
                    ),
                  }))
                }
                minHeight={240}
              />
              <div className="space-y-1">
                <Label>Доступные переменные</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ACCESS_NOTIFICATION_VARIABLES.map((variable) => (
                    <span
                      key={variable.name}
                      className="rounded-md border border-border/60 bg-muted px-2 py-1 text-xs text-muted-foreground"
                      title={variable.description}
                    >
                      {`{{${variable.name}}}`}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Предпросмотр (на примерных данных)</Label>
                <div className="rounded-lg border bg-background p-3 text-sm">
                  <div className="mb-2 font-medium">
                    {renderAccessNotification(selectedMailingTemplate.subject, MAILING_PREVIEW_VARIABLES) ||
                      '(тема не заполнена)'}
                  </div>
                  <MarkdownContent
                    text={renderAccessNotification(selectedMailingTemplate.body, MAILING_PREVIEW_VARIABLES)}
                    bodyFormat="markdown"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mailing-template-reason">Причина изменения (необязательно)</Label>
                <Input
                  id="mailing-template-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} type="submit">
                  Сохранить
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const templateId = selectedMailingTemplate.id;
                    setTariff((current) => ({
                      ...current,
                      mailingTemplates: current.mailingTemplates.filter(
                        (template) => template.id !== templateId,
                      ),
                    }));
                    setSelectedTemplateId(null);
                  }}
                >
                  Удалить шаблон
                </Button>
              </div>
            </form>
          )}
        </DoctorSection>
      </TabsContent>
    </Tabs>
  );
}
