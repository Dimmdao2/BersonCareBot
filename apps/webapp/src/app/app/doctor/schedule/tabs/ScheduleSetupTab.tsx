'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { BookingPublicAttributionSection } from '@/app/app/settings/BookingPublicAttributionSection';
import { BookingPublicWidgetSection } from '@/app/app/settings/BookingPublicWidgetSection';
import { BookingPrepaymentSection } from '@/app/app/settings/BookingPrepaymentSection';
import { BookingPaymentsSection } from '@/app/app/settings/BookingPaymentsSection';
import { BookingSoloAvailabilitySection } from '@/app/app/settings/BookingSoloAvailabilitySection';
import { BookingSoloFormFieldsSection } from '@/app/app/settings/BookingSoloFormFieldsSection';
import { BookingSoloLocationsSection } from '@/app/app/settings/BookingSoloLocationsSection';
import { BookingSoloServicesSection } from '@/app/app/settings/BookingSoloServicesSection';
import { BookingSoloSpecialistsSection } from '@/app/app/settings/BookingSoloSpecialistsSection';
import { BookingRulesPageClient } from '@/app/app/doctor/admin/booking/BookingRulesPageClient';
import { ScheduleNotificationsSection } from './notifications/ScheduleNotificationsSection';
import { parseBookingPaymentSettingsValue } from '@/modules/payments/bookingPaymentSettings';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { BOOKING_CARD_GRID_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Label } from '@/shared/ui/doctor/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { apiJson } from '@/shared/lib/apiJson';
import toast from 'react-hot-toast';
import type { ScheduleTabProps } from '../scheduleTabRegistry';

// ---------------------------------------------------------------------------
// Sub-nav section definition
// ---------------------------------------------------------------------------

type SetupSectionId =
  | 'calendar'
  | 'locations'
  | 'services'
  | 'specialists'
  | 'form'
  | 'payments'
  | 'rules'
  | 'notifications'
  | 'packages';

type SetupSectionDef = {
  id: SetupSectionId;
  label: string;
};

const SETUP_SECTIONS: SetupSectionDef[] = [
  { id: 'calendar', label: 'Календарь' },
  { id: 'locations', label: 'Локации' },
  { id: 'services', label: 'Услуги' },
  { id: 'specialists', label: 'Специалисты' },
  { id: 'form', label: 'Публичная форма' },
  { id: 'payments', label: 'Оплаты' },
  { id: 'rules', label: 'Правила записи' },
  { id: 'notifications', label: 'Тексты уведомлений' },
  { id: 'packages', label: 'Абонементы' },
];

const DEFAULT_SECTION: SetupSectionId = 'calendar';

type SetupSectionVisibility = Readonly<{
  payments: boolean;
  notifications: boolean;
  packages: boolean;
}>;

function sectionIsVisible(section: SetupSectionDef, visibility: SetupSectionVisibility): boolean {
  if (section.id === 'payments') return visibility.payments;
  if (section.id === 'notifications') return visibility.notifications;
  if (section.id === 'packages') return visibility.packages;
  return true;
}

function resolveSectionId(
  raw: string | undefined,
  visibility: SetupSectionVisibility,
): SetupSectionId {
  if (
    SETUP_SECTIONS.some((section) => section.id === raw && sectionIsVisible(section, visibility))
  ) {
    return raw as SetupSectionId;
  }
  return DEFAULT_SECTION;
}

// ---------------------------------------------------------------------------
// Client-fetching wrapper for BookingPaymentsSection
// Payments page uses SSR props; we fetch them lazily from GET /api/admin/settings.
// ---------------------------------------------------------------------------

type PaymentSettingsState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      paymentEnabled: boolean;
      providersJson: ReturnType<typeof parseBookingPaymentSettingsValue>;
    };

function BookingPaymentsSectionLoader({ readOnly }: { readOnly: boolean }) {
  const [state, setState] = useState<PaymentSettingsState>({ phase: 'loading' });
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetch('/api/admin/settings');
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: Array<{ key: string; valueJson: unknown }>;
      } | null;
      if (!res.ok || !json?.ok) {
        setState({ phase: 'error', message: 'Не удалось загрузить настройки оплаты' });
        return;
      }
      const enabledRow = json.settings?.find((s) => s.key === 'booking_payment_enabled');
      const providersRow = json.settings?.find((s) => s.key === 'booking_payment_providers');
      const paymentEnabled =
        enabledRow != null &&
        enabledRow.valueJson !== null &&
        typeof enabledRow.valueJson === 'object' &&
        (enabledRow.valueJson as Record<string, unknown>).value === true;
      const providersJson = parseBookingPaymentSettingsValue(providersRow?.valueJson ?? null);
      setState({ phase: 'ready', paymentEnabled, providersJson });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === 'loading') {
    return <p className="text-sm text-muted-foreground">Загрузка настроек оплаты…</p>;
  }
  if (state.phase === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }
  return (
    <BookingPaymentsSection
      paymentEnabled={state.paymentEnabled}
      providersJson={state.providersJson}
      readOnly={readOnly}
    />
  );
}

// ---------------------------------------------------------------------------
// Client-fetching wrapper for BookingRulesPageClient
// The "allowPastUnlink" flag is loaded from GET /api/admin/settings.
// ---------------------------------------------------------------------------

type RulesSettingsState =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; allowPastUnlink: boolean };

function BookingRulesLoader() {
  const [state, setState] = useState<RulesSettingsState>({ phase: 'loading' });
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await fetch('/api/admin/settings');
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        settings?: Array<{ key: string; valueJson: unknown }>;
      } | null;
      if (!res.ok || !json?.ok) {
        setState({ phase: 'error' });
        return;
      }
      const row = json.settings?.find(
        (s) => s.key === 'booking_allow_doctor_unlink_past_package_sessions',
      );
      const allowPastUnlink =
        row != null &&
        row.valueJson !== null &&
        typeof row.valueJson === 'object' &&
        (row.valueJson as Record<string, unknown>).value === true;
      setState({ phase: 'ready', allowPastUnlink });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === 'loading') {
    return <p className="text-sm text-muted-foreground">Загрузка правил записи…</p>;
  }
  if (state.phase === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">Не удалось загрузить настройки</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }
  return <BookingRulesPageClient allowPastUnlinkPastPackageSessions={state.allowPastUnlink} />;
}

type CalendarSettingsRow = {
  key: string;
  valueJson: unknown;
};

type CalendarCatalogOption = {
  id: string;
  label: string;
  durationMinutes?: number;
};

type CalendarSettingsState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | {
      phase: 'ready';
      branches: CalendarCatalogOption[];
      services: CalendarCatalogOption[];
      specialists: CalendarCatalogOption[];
      defaultStart: string;
      defaultEnd: string;
      defaultBranchId: string | null;
      defaultServiceId: string | null;
      defaultSpecialistId: string | null;
    };

function getSettingValue(rows: CalendarSettingsRow[], key: string): unknown {
  const valueJson = rows.find((row) => row.key === key)?.valueJson;
  if (valueJson && typeof valueJson === 'object' && 'value' in valueJson) {
    return (valueJson as { value?: unknown }).value;
  }
  return null;
}

function minuteToTimeInput(minute: number): string {
  const safe = Math.max(0, Math.min(24 * 60, minute));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeInputToMinute(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return null;
  }
  return h * 60 + min;
}

function parseDefaultWindow(raw: unknown): { startMinute: number; endMinute: number } {
  if (raw && typeof raw === 'object') {
    const obj = raw as { startMinute?: unknown; endMinute?: unknown };
    if (typeof obj.startMinute === 'number' && typeof obj.endMinute === 'number') {
      const startMinute = Math.max(0, Math.min(1439, Math.round(obj.startMinute)));
      const endMinute = Math.max(startMinute + 30, Math.min(1440, Math.round(obj.endMinute)));
      return { startMinute, endMinute };
    }
  }
  return { startMinute: 9 * 60, endMinute: 19 * 60 };
}

function stringOrNull(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

function ScheduleCalendarDefaultsSection() {
  const [state, setState] = useState<CalendarSettingsState>({ phase: 'loading' });
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  const fetchCalendarSettings = useCallback(async (): Promise<CalendarSettingsState> => {
    const [settingsJson, calendarJson] = await Promise.all([
      apiJson<{ ok: boolean; settings: CalendarSettingsRow[] }>('/api/doctor/settings'),
      apiJson<{
        ok: boolean;
        filters: {
          branches: CalendarCatalogOption[];
          services: CalendarCatalogOption[];
          specialists: CalendarCatalogOption[];
        };
      }>('/api/doctor/booking-engine/calendar?view=day&scope=clinic'),
    ]);
    const windowValue = parseDefaultWindow(
      getSettingValue(settingsJson.settings, 'booking_calendar_default_window'),
    );
    return {
      phase: 'ready',
      branches: calendarJson.filters.branches,
      services: calendarJson.filters.services,
      specialists: calendarJson.filters.specialists,
      defaultStart: minuteToTimeInput(windowValue.startMinute),
      defaultEnd: minuteToTimeInput(windowValue.endMinute),
      defaultBranchId: stringOrNull(
        getSettingValue(settingsJson.settings, 'booking_calendar_default_branch_id'),
      ),
      defaultServiceId: stringOrNull(
        getSettingValue(settingsJson.settings, 'booking_calendar_default_service_id'),
      ),
      defaultSpecialistId: stringOrNull(
        getSettingValue(settingsJson.settings, 'booking_calendar_default_specialist_id'),
      ),
    };
  }, []);

  const load = useCallback(() => {
    setSaved(false);
    startTransition(async () => {
      try {
        setState(await fetchCalendarSettings());
      } catch (e) {
        setState({ phase: 'error', message: e instanceof Error ? e.message : 'load_failed' });
      }
    });
  }, [fetchCalendarSettings]);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      try {
        const next = await fetchCalendarSettings();
        if (!cancelled) setState(next);
      } catch (e) {
        if (!cancelled) {
          setState({ phase: 'error', message: e instanceof Error ? e.message : 'load_failed' });
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchCalendarSettings]);

  function patchDoctorSetting(key: string, value: unknown): Promise<void> {
    return apiJson('/api/doctor/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: { value } }),
    }).then(() => undefined);
  }

  function updateReady(patch: Partial<Extract<CalendarSettingsState, { phase: 'ready' }>>) {
    setState((prev) => (prev.phase === 'ready' ? { ...prev, ...patch } : prev));
    setSaved(false);
  }

  function save() {
    if (state.phase !== 'ready') return;
    const startMinute = timeInputToMinute(state.defaultStart);
    const endMinute = timeInputToMinute(state.defaultEnd);
    if (startMinute === null || endMinute === null || endMinute <= startMinute) {
      setState({ phase: 'error', message: 'Проверьте начало и конец окна календаря' });
      return;
    }
    startTransition(async () => {
      try {
        await Promise.all([
          patchDoctorSetting('booking_calendar_default_window', { startMinute, endMinute }),
          patchDoctorSetting('booking_calendar_default_branch_id', state.defaultBranchId),
          patchDoctorSetting('booking_calendar_default_service_id', state.defaultServiceId),
          patchDoctorSetting('booking_calendar_default_specialist_id', state.defaultSpecialistId),
        ]);
        setSaved(true);
      } catch {
        setState({ phase: 'error', message: 'Не удалось сохранить настройки календаря' });
      }
    });
  }

  if (state.phase === 'loading') {
    return <p className="text-sm text-muted-foreground">Загрузка настроек календаря…</p>;
  }
  if (state.phase === 'error') {
    return (
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Календарь</DoctorSectionTitle>
        </DoctorSectionHeader>
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">{state.message}</p>
          <Button type="button" size="sm" variant="outline" onClick={load}>
            Повторить
          </Button>
        </div>
      </DoctorSection>
    );
  }

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Календарь</DoctorSectionTitle>
      </DoctorSectionHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Окно календаря по умолчанию</Label>
          <div className="flex items-center gap-2">
            <Input
              type="time"
              className="w-32"
              value={state.defaultStart}
              onChange={(e) => updateReady({ defaultStart: e.target.value })}
            />
            <span className="text-sm text-muted-foreground">—</span>
            <Input
              type="time"
              className="w-32"
              value={state.defaultEnd}
              onChange={(e) => updateReady({ defaultEnd: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Используется, когда в периоде нет рабочих часов или записей; если данные выходят за
            окно, сетка расширяется.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Филиал по умолчанию</Label>
          <Select
            value={state.defaultBranchId ?? '__none__'}
            onValueChange={(v) => updateReady({ defaultBranchId: v === '__none__' ? null : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" label="Не выбран">
                Не выбран
              </SelectItem>
              {state.branches.map((branch) => (
                <SelectItem key={branch.id} value={branch.id} label={branch.label}>
                  {branch.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Услуга по умолчанию</Label>
          <Select
            value={state.defaultServiceId ?? '__none__'}
            onValueChange={(v) => updateReady({ defaultServiceId: v === '__none__' ? null : v })}
          >
            <SelectTrigger
              displayLabel={
                state.services.find((s) => s.id === state.defaultServiceId)?.label ?? 'Не выбрана'
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" label="Не выбрана">
                Не выбрана
              </SelectItem>
              {state.services.map((service) => (
                <SelectItem key={service.id} value={service.id} label={service.label}>
                  {service.label}
                  {service.durationMinutes ? ` · ${service.durationMinutes} мин` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Специалист по умолчанию</Label>
          <Select
            value={state.defaultSpecialistId ?? '__none__'}
            onValueChange={(v) => updateReady({ defaultSpecialistId: v === '__none__' ? null : v })}
          >
            <SelectTrigger
              displayLabel={
                state.specialists.find((s) => s.id === state.defaultSpecialistId)?.label ??
                'Не выбран'
              }
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" label="Не выбран">
                Не выбран
              </SelectItem>
              {state.specialists.map((specialist) => (
                <SelectItem key={specialist.id} value={specialist.id} label={specialist.label}>
                  {specialist.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button type="button" size="sm" onClick={save}>
          Сохранить
        </Button>
        {saved ? <span className="text-sm text-green-600">Сохранено</span> : null}
      </div>
    </DoctorSection>
  );
}

// ---------------------------------------------------------------------------
// Packages (catalog templates) section
// ---------------------------------------------------------------------------

type CatalogPackageItem = { serviceId: string; quantity: number; sortOrder?: number };

type CatalogPackage = {
  id: string;
  title: string;
  priceMinor: number;
  validityDays: number | null;
  deductionMode: 'auto_on_visit_confirmed' | 'manual';
  isActive: boolean;
  items: Array<{ id?: string; serviceId: string; quantity: number; sortOrder?: number }>;
};

type PackageService = { id: string; title: string; isActive: boolean; usableInPackages: boolean };

type PackagesState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; packages: CatalogPackage[]; services: PackageService[] };

function SectionPackages({ readOnly }: { readOnly: boolean }) {
  const [state, setState] = useState<PackagesState>({ phase: 'loading' });
  const [, startTransition] = useTransition();

  // Create form state
  const [title, setTitle] = useState('');
  const [priceRub, setPriceRub] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [deductionMode, setDeductionMode] = useState<'auto_on_visit_confirmed' | 'manual'>(
    'auto_on_visit_confirmed',
  );
  const [formItems, setFormItems] = useState<CatalogPackageItem[]>([]);
  const [itemServiceId, setItemServiceId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [formPending, startFormTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      try {
        const [pkgJson, svcJson] = await Promise.all([
          apiJson<{ ok: boolean; packages: CatalogPackage[] }>(
            '/api/doctor/booking-engine/packages',
          ),
          apiJson<{ ok: boolean; services: PackageService[] }>(
            '/api/doctor/booking-engine/services',
          ),
        ]);
        setState({ phase: 'ready', packages: pkgJson.packages, services: svcJson.services });
      } catch {
        setState({ phase: 'error', message: 'Не удалось загрузить шаблоны абонементов' });
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function addFormItem() {
    if (!itemServiceId) return;
    const q = Number.parseInt(itemQuantity, 10);
    if (!Number.isFinite(q) || q < 1) return;
    setFormItems((prev) => [
      ...prev,
      { serviceId: itemServiceId, quantity: q, sortOrder: prev.length },
    ]);
    setItemServiceId('');
    setItemQuantity('1');
  }

  function removeFormItem(idx: number) {
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function resetForm() {
    setTitle('');
    setPriceRub('');
    setValidityDays('');
    setDeductionMode('auto_on_visit_confirmed');
    setFormItems([]);
    setItemServiceId('');
    setItemQuantity('1');
  }

  function createPackage() {
    const priceMinor = Math.round(Number.parseFloat(priceRub.replace(',', '.')) * 100);
    const days = validityDays ? Number.parseInt(validityDays, 10) : null;
    if (!title.trim() || !Number.isFinite(priceMinor) || priceMinor < 0 || formItems.length === 0) {
      toast.error('Заполните название, цену и добавьте хотя бы одну позицию');
      return;
    }
    if (days !== null && (!Number.isFinite(days) || days < 1)) {
      toast.error('Срок действия должен быть целым числом ≥ 1');
      return;
    }
    startFormTransition(async () => {
      try {
        await apiJson('/api/doctor/booking-engine/packages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: title.trim(),
            priceMinor,
            validityDays: days,
            deductionMode,
            isActive: true,
            items: formItems,
          }),
        });
        toast.success('Шаблон создан');
        resetForm();
        load();
      } catch {
        toast.error('Не удалось создать шаблон');
      }
    });
  }

  function toggleActive(pkg: CatalogPackage) {
    startTransition(async () => {
      try {
        await apiJson(`/api/doctor/booking-engine/packages/${pkg.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: !pkg.isActive }),
        });
        toast.success(pkg.isActive ? 'Шаблон деактивирован' : 'Шаблон активирован');
        load();
      } catch {
        toast.error('Не удалось обновить шаблон');
      }
    });
  }

  if (state.phase === 'loading') {
    return <p className="text-sm text-muted-foreground">Загрузка шаблонов абонементов…</p>;
  }
  if (state.phase === 'error') {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{state.message}</p>
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Повторить
        </Button>
      </div>
    );
  }

  const activeServices = state.services.filter((s) => s.isActive && s.usableInPackages);

  return (
    <div className="flex flex-col gap-4">
      <DoctorSection>
        <DoctorSectionHeader>
          <DoctorSectionTitle>Шаблоны абонементов</DoctorSectionTitle>
        </DoctorSectionHeader>

        {state.packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Шаблонов нет. Создайте первый ниже.</p>
        ) : (
          <ul className="m-0 list-none space-y-2 p-0" data-testid="catalog-packages-list">
            {state.packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{pkg.title}</span>
                    <span
                      className={
                        pkg.isActive
                          ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                          : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
                      }
                    >
                      {pkg.isActive ? 'Активен' : 'Неактивен'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(pkg.priceMinor / 100).toLocaleString('ru-RU')} ₽
                      {pkg.validityDays ? ` · ${pkg.validityDays} дн.` : ''}
                      {' · '}
                      {pkg.deductionMode === 'auto_on_visit_confirmed' ? 'Авто' : 'Вручную'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {pkg.items.map((it, idx) => {
                      const svc = state.services.find((s) => s.id === it.serviceId);
                      return (
                        <span key={idx} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {svc?.title ?? it.serviceId} × {it.quantity}
                        </span>
                      );
                    })}
                  </div>
                </div>
                {!readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(pkg)}
                  >
                    {pkg.isActive ? 'Деактивировать' : 'Активировать'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </DoctorSection>

      {!readOnly && (
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Создать шаблон</DoctorSectionTitle>
          </DoctorSectionHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pkg-tpl-title">Название</Label>
              <Input
                id="pkg-tpl-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Например: Курс 10 занятий"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-tpl-price">Цена, ₽</Label>
              <Input
                id="pkg-tpl-price"
                value={priceRub}
                onChange={(e) => setPriceRub(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pkg-tpl-days">Срок действия, дней (необязательно)</Label>
              <Input
                id="pkg-tpl-days"
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-2">
              <Label>Режим списания</Label>
              <Select
                value={deductionMode}
                onValueChange={(v) => setDeductionMode(v as 'auto_on_visit_confirmed' | 'manual')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="auto_on_visit_confirmed"
                    label="Автоматически при подтверждении"
                  >
                    Автоматически при подтверждении
                  </SelectItem>
                  <SelectItem value="manual" label="Вручную">
                    Вручную
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label>Позиции (услуга × количество)</Label>
            {formItems.length > 0 && (
              <ul className="m-0 list-none space-y-1 p-0">
                {formItems.map((it, idx) => {
                  const svc = activeServices.find((s) => s.id === it.serviceId);
                  return (
                    <li key={idx} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {svc?.title ?? it.serviceId} × {it.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="text-destructive text-xs h-auto p-0"
                        onClick={() => removeFormItem(idx)}
                      >
                        Убрать
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1">
                <Select value={itemServiceId} onValueChange={(v) => setItemServiceId(v ?? '')}>
                  <SelectTrigger
                    displayLabel={
                      activeServices.find((s) => s.id === itemServiceId)?.title ?? 'Выберите услугу'
                    }
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeServices.map((s) => (
                      <SelectItem key={s.id} value={s.id} label={s.title}>
                        {s.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20">
                <Label htmlFor="pkg-tpl-qty" className="sr-only">
                  Количество
                </Label>
                <Input
                  id="pkg-tpl-qty"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  placeholder="1"
                />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addFormItem}>
                Добавить позицию
              </Button>
            </div>
          </div>

          <div className="mt-4">
            <Button type="button" size="sm" disabled={formPending} onClick={createPackage}>
              Создать шаблон
            </Button>
          </div>
        </DoctorSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section content components
// ---------------------------------------------------------------------------

function SectionCalendar() {
  return <ScheduleCalendarDefaultsSection />;
}

function SectionLocations() {
  return (
    <div className="flex flex-col gap-3">
      <BookingSoloLocationsSection />
      <BookingSoloAvailabilitySection />
    </div>
  );
}

function SectionServices() {
  return <BookingSoloServicesSection />;
}

function SectionSpecialists() {
  return <BookingSoloSpecialistsSection />;
}

function SectionForm({
  doctorStatisticsEnabled,
}: Pick<ScheduleTabProps, 'doctorStatisticsEnabled'>) {
  return (
    <div className="flex flex-col gap-3">
      <BookingSoloFormFieldsSection />
      <div className={BOOKING_CARD_GRID_CLASS}>
        <BookingPublicWidgetSection />
        <BookingPublicAttributionSection visible={doctorStatisticsEnabled} />
      </div>
    </div>
  );
}

function SectionPayments({ readOnly }: { readOnly: boolean }) {
  return (
    <div className={BOOKING_CARD_GRID_CLASS}>
      <BookingPaymentsSectionLoader readOnly={readOnly} />
      <BookingPrepaymentSection />
    </div>
  );
}

function SectionRules() {
  return <BookingRulesLoader />;
}

function SectionNotifications() {
  return <ScheduleNotificationsSection />;
}

// ---------------------------------------------------------------------------
// ScheduleSetupTab — main component
// ---------------------------------------------------------------------------

/**
 * Таб «Настройки записи» раздела «Расписание».
 * Clinic-management only: навигация доступна owner/admin своей организации.
 * Под-навигация секций по deep-link `section` ↔ scheduleTabRegistry deepLinkKeys: ["section"].
 */
export function ScheduleSetupTab({
  deepLinkParams,
  onDeepLinkChange,
  doctorStatisticsEnabled,
  paymentsVisible = true,
  paymentsReadOnly = false,
  notificationTemplatesVisible = true,
  packagesVisible = true,
  packagesReadOnly = false,
}: ScheduleTabProps) {
  const sectionVisibility: SetupSectionVisibility = {
    payments: paymentsVisible,
    notifications: notificationTemplatesVisible,
    packages: packagesVisible,
  };
  const [activeSection, setActiveSectionState] = useState<SetupSectionId>(() =>
    resolveSectionId(deepLinkParams.section, sectionVisibility),
  );

  const visibleSections = SETUP_SECTIONS.filter((section) =>
    sectionIsVisible(section, sectionVisibility),
  );

  const setActiveSection = useCallback(
    (id: SetupSectionId) => {
      setActiveSectionState(id);
      onDeepLinkChange('section', id === DEFAULT_SECTION ? null : id);
    },
    [onDeepLinkChange],
  );

  return (
    <div className="flex flex-col gap-3" data-testid="schedule-setup-tab">
      {/* Sub-navigation */}
      <nav
        className="flex flex-wrap gap-1"
        aria-label="Разделы настройки записи"
        data-testid="setup-subnav"
      >
        {visibleSections.map((sec) => (
          <Button
            key={sec.id}
            type="button"
            size="sm"
            variant={activeSection === sec.id ? 'default' : 'outline'}
            onClick={() => setActiveSection(sec.id)}
            data-testid={`setup-nav-${sec.id}`}
          >
            {sec.label}
          </Button>
        ))}
      </nav>

      {/* Active section content */}
      <div data-testid={`setup-section-${activeSection}`}>
        {activeSection === 'calendar' && <SectionCalendar />}
        {activeSection === 'locations' && <SectionLocations />}
        {activeSection === 'services' && <SectionServices />}
        {activeSection === 'specialists' && <SectionSpecialists />}
        {activeSection === 'form' && (
          <SectionForm doctorStatisticsEnabled={doctorStatisticsEnabled} />
        )}
        {activeSection === 'payments' && paymentsVisible && (
          <SectionPayments readOnly={paymentsReadOnly} />
        )}
        {activeSection === 'rules' && <SectionRules />}
        {activeSection === 'notifications' && notificationTemplatesVisible && (
          <SectionNotifications />
        )}
        {activeSection === 'packages' && packagesVisible && (
          <SectionPackages readOnly={packagesReadOnly} />
        )}
      </div>
    </div>
  );
}
