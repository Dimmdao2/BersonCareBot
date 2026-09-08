'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { BookingPublicWidgetSection } from '@/app/app/settings/BookingPublicWidgetSection';
import { BookingSoloAvailabilitySection } from '@/app/app/settings/BookingSoloAvailabilitySection';
import { BookingSoloFormFieldsSection } from '@/app/app/settings/BookingSoloFormFieldsSection';
import { BookingSoloLocationsSection } from '@/app/app/settings/BookingSoloLocationsSection';
import { BookingSoloServicesSection } from '@/app/app/settings/BookingSoloServicesSection';
import { BookingSoloSpecialistsSection } from '@/app/app/settings/BookingSoloSpecialistsSection';
import { BookingRulesPageClient } from '@/app/app/doctor/admin/booking/BookingRulesPageClient';
import { ScheduleNotificationsSection } from './notifications/ScheduleNotificationsSection';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import { DoctorShellMobileSubsectionTabsRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
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
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { SYSTEM_SETTING_REGISTRY } from '@/modules/system-settings/registry';

// ---------------------------------------------------------------------------
// Sub-nav section definition
// ---------------------------------------------------------------------------

type SetupSectionId =
  'locations' | 'services' | 'specialists' | 'form' | 'rules' | 'notifications' | 'packages';

type SetupSectionDef = {
  id: SetupSectionId;
  label: string;
};

const SETUP_SECTIONS: SetupSectionDef[] = [
  { id: 'locations', label: 'Филиалы' },
  { id: 'services', label: 'Услуги' },
  { id: 'specialists', label: 'Специалисты' },
  { id: 'form', label: 'Публичная форма' },
  { id: 'rules', label: 'Правила записи' },
  { id: 'notifications', label: 'Тексты уведомлений' },
  { id: 'packages', label: 'Абонементы' },
];

const DEFAULT_SECTION: SetupSectionId = 'locations';

type SetupSectionVisibility = Readonly<{
  notifications: boolean;
  packages: boolean;
}>;

function sectionIsVisible(section: SetupSectionDef, visibility: SetupSectionVisibility): boolean {
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
// Client-fetching wrapper for BookingRulesPageClient.
// ---------------------------------------------------------------------------

type RulesSettingsState =
  { phase: 'loading' } | { phase: 'error' } | { phase: 'ready'; availabilityHorizonDays: number };

const BOOKING_AVAILABILITY_HORIZON_DEFAULT_DAYS = Number(
  SYSTEM_SETTING_REGISTRY.booking_availability_horizon_days.defaultValue,
);

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
      const horizonRow = json.settings?.find((s) => s.key === 'booking_availability_horizon_days');
      // BAH-01/F2: отсутствие per-org строки — реестровый дефолт, раздел работает.
      // Строка есть, но значение сломано — phase: 'error' (громко, не маскировать).
      let availabilityHorizonDays: number;
      if (!horizonRow) {
        availabilityHorizonDays = BOOKING_AVAILABILITY_HORIZON_DEFAULT_DAYS;
      } else {
        const rawValue =
          horizonRow.valueJson !== null &&
          typeof horizonRow.valueJson === 'object' &&
          'value' in horizonRow.valueJson
            ? horizonRow.valueJson.value
            : null;
        if (
          typeof rawValue !== 'number' ||
          !Number.isInteger(rawValue) ||
          rawValue < 1 ||
          rawValue > 92
        ) {
          setState({ phase: 'error' });
          return;
        }
        availabilityHorizonDays = rawValue;
      }
      setState({ phase: 'ready', availabilityHorizonDays });
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.phase === 'loading') {
    return <DoctorPanelLoading className="py-6" />;
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
  return <BookingRulesPageClient availabilityHorizonDays={state.availabilityHorizonDays} />;
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
    return <DoctorPanelLoading className="py-6" />;
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

  const activeServices = state.services.filter((s) => s.isActive);

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

function SectionLocations() {
  return <BookingSoloLocationsSection />;
}

function SectionServices() {
  return (
    <div className="flex flex-col gap-3">
      <BookingSoloServicesSection />
      <BookingSoloAvailabilitySection />
    </div>
  );
}

function SectionSpecialists() {
  return <BookingSoloSpecialistsSection />;
}

function SectionForm() {
  return (
    <div className="flex flex-col gap-3">
      <BookingSoloFormFieldsSection />
      <BookingPublicWidgetSection />
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
  isActive,
  notificationTemplatesVisible = true,
  packagesVisible = true,
  packagesReadOnly = false,
  setupPackagesOnly = false,
}: ScheduleTabProps) {
  const sectionVisibility: SetupSectionVisibility = useMemo(
    () => ({
      notifications: notificationTemplatesVisible,
      packages: packagesVisible,
    }),
    [notificationTemplatesVisible, packagesVisible],
  );
  const [activeSection, setActiveSectionState] = useState<SetupSectionId>(() =>
    setupPackagesOnly ? 'packages' : resolveSectionId(deepLinkParams.section, sectionVisibility),
  );

  // MGMT-UI-01: this tab instance stays mounted while the deep-link `section` changes
  // externally (clinic management menu navigation rewrites the query param without
  // remounting the tab), so the initial-only useState above is not enough — follow the
  // external value here. Internal clicks (setActiveSection below) push the same id back
  // into deepLinkParams, so this effect is a no-op for that path.
  const resolvedExternalSection = setupPackagesOnly
    ? 'packages'
    : resolveSectionId(deepLinkParams.section, sectionVisibility);
  useEffect(() => {
    setActiveSectionState((prev) => (prev === resolvedExternalSection ? prev : resolvedExternalSection));
  }, [resolvedExternalSection]);

  const visibleSections = useMemo(
    () =>
      SETUP_SECTIONS.filter(
        (section) =>
          sectionIsVisible(section, sectionVisibility) &&
          (!setupPackagesOnly || section.id === 'packages'),
      ),
    [sectionVisibility, setupPackagesOnly],
  );

  const setActiveSection = useCallback(
    (id: SetupSectionId) => {
      setActiveSectionState(id);
      onDeepLinkChange('section', id === DEFAULT_SECTION ? null : id);
    },
    [onDeepLinkChange],
  );

  // CAL-NAV-01/02: the subsection row is docked as the third mobile chrome row above the
  // section tabs instead of scrolling inside the page header. Memoised because the shell
  // registration stores the node — a new element every render would re-register forever.
  const mobileSubsectionTabs = useMemo(
    () =>
      isActive === false ? null : (
        <DoctorMobileSectionTabs
          tabs={visibleSections}
          activeTab={activeSection}
          onTabChange={setActiveSection}
          ariaLabel="Разделы настроек"
          scrollable
        />
      ),
    [activeSection, isActive, setActiveSection, visibleSections],
  );

  return (
    <div
      className="-mx-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-3 md:mx-0 md:px-0 md:pt-0"
      data-testid="schedule-setup-tab"
    >
      <DoctorShellMobileSubsectionTabsRegistration content={mobileSubsectionTabs} />
      {/* Sub-navigation */}
      {!setupPackagesOnly ? (
        <nav
          className="hidden flex-wrap gap-1 md:flex"
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
      ) : null}

      {/* Active section content */}
      <div data-testid={`setup-section-${activeSection}`}>
        {activeSection === 'locations' && <SectionLocations />}
        {activeSection === 'services' && <SectionServices />}
        {activeSection === 'specialists' && <SectionSpecialists />}
        {activeSection === 'form' && <SectionForm />}
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
