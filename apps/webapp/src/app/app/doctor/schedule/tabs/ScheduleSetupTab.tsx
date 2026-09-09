'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Archive, BadgePlus, ChevronRight, ShoppingBag } from 'lucide-react';
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
  DoctorSectionActions,
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
} from '@/shared/ui/doctor/primitives/select';
import { apiJson } from '@/shared/lib/apiJson';
import toast from 'react-hot-toast';
import type { ScheduleTabProps } from '../scheduleTabRegistry';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorModal, DoctorModalCompositeTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorResultCount } from '@/shared/ui/doctor/DoctorResultCount';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { SYSTEM_SETTING_REGISTRY } from '@/modules/system-settings/registry';
import type { PackageItemInput, SubscriptionPackageRecord } from '@/modules/memberships/types';
import {
  DoctorSoldMembershipsModal,
  type DoctorSoldMembership,
} from '@/shared/ui/doctor/DoctorSoldMembershipsModal';
import { cn } from '@/lib/utils';

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
// Membership catalog section
// ---------------------------------------------------------------------------

type CatalogPackageItem = PackageItemInput;

type CatalogPackage = SubscriptionPackageRecord;

type PackageService = { id: string; title: string; isActive: boolean; usableInPackages: boolean };

type PackagesState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; packages: CatalogPackage[]; services: PackageService[] };

function formatPackageMoney(priceMinor: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(priceMinor / 100);
}

function pluralizeSessions(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'сеансов';
  if (mod10 === 1) return 'сеанс';
  if (mod10 >= 2 && mod10 <= 4) return 'сеанса';
  return 'сеансов';
}

function pluralizeServices(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'услуг';
  if (mod10 === 1) return 'услуга';
  if (mod10 >= 2 && mod10 <= 4) return 'услуги';
  return 'услуг';
}

function formatValidityDays(value: number | null): string {
  if (value === null) return 'Без срока';
  const mod10 = value % 10;
  const mod100 = value % 100;
  const suffix =
    mod100 >= 11 && mod100 <= 19 ? 'дней' : mod10 === 1 ? 'день' : mod10 < 5 ? 'дня' : 'дней';
  return `${value} ${suffix}`;
}

function SectionPackages({ readOnly }: { readOnly: boolean }) {
  const [state, setState] = useState<PackagesState>({ phase: 'loading' });
  const [, startTransition] = useTransition();
  const [packageView, setPackageView] = useState<'active' | 'archived'>('active');
  const [selectedCatalogPackage, setSelectedCatalogPackage] = useState<CatalogPackage | null>(null);
  const [packageFormOpen, setPackageFormOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CatalogPackage | null>(null);
  const [soldOpen, setSoldOpen] = useState(false);
  const [soldPackages, setSoldPackages] = useState<DoctorSoldMembership[] | null>(null);

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
        setState({ phase: 'error', message: 'Не удалось загрузить абонементы' });
      }
    });
  }, []);

  const loadSoldPackages = useCallback(async () => {
    try {
      const json = await apiJson<{ ok: boolean; packages: DoctorSoldMembership[] }>(
        '/api/doctor/booking-engine/patient-packages/sold',
      );
      setSoldPackages(json.packages);
    } catch {
      setSoldPackages(null);
    }
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

  function openCreateForm() {
    resetForm();
    setEditingPackage(null);
    setPackageFormOpen(true);
  }

  function openEditForm(pkg: CatalogPackage) {
    setTitle(pkg.title);
    setPriceRub(String(pkg.priceMinor / 100));
    setValidityDays(pkg.validityDays ? String(pkg.validityDays) : '');
    setDeductionMode(pkg.deductionMode);
    setFormItems(
      pkg.items.map((item, index) => ({
        serviceId: item.serviceId,
        quantity: item.quantity,
        sortOrder: item.sortOrder ?? index,
      })),
    );
    setItemServiceId('');
    setItemQuantity('1');
    setEditingPackage(pkg);
    setPackageFormOpen(true);
  }

  function closePackageForm() {
    setPackageFormOpen(false);
    setEditingPackage(null);
    resetForm();
  }

  function savePackage() {
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
        const json = await apiJson<{ ok: boolean; package: CatalogPackage }>(
          editingPackage
            ? `/api/doctor/booking-engine/packages/${editingPackage.id}`
            : '/api/doctor/booking-engine/packages',
          {
            method: editingPackage ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.trim(),
              priceMinor,
              validityDays: days,
              deductionMode,
              ...(!editingPackage ? { isActive: true } : null),
              items: formItems,
            }),
          },
        );
        toast.success(editingPackage ? 'Абонемент изменён' : 'Абонемент добавлен');
        if (editingPackage) setSelectedCatalogPackage(json.package);
        closePackageForm();
        load();
      } catch {
        toast.error(
          editingPackage ? 'Не удалось изменить абонемент' : 'Не удалось добавить абонемент',
        );
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
        toast.success(pkg.isActive ? 'Абонемент отправлен в архив' : 'Абонемент восстановлен');
        setSelectedCatalogPackage(null);
        load();
      } catch {
        toast.error('Не удалось обновить абонемент');
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

  const activeServices = state.services.filter(
    (service) => service.isActive && service.usableInPackages,
  );
  const visiblePackages = state.packages.filter((pkg) =>
    packageView === 'active' ? pkg.isActive : !pkg.isActive,
  );
  const selectedCatalogSoldCount =
    selectedCatalogPackage && soldPackages
      ? soldPackages.filter((pkg) => pkg.subscriptionPackageId === selectedCatalogPackage.id).length
      : null;

  return (
    <>
      <DoctorSection className="overflow-hidden p-0">
        <DoctorSectionHeader className="flex-row items-center justify-between gap-3 px-[var(--doctor-block-padding,18px)] pt-[var(--doctor-block-padding,18px)]">
          <DoctorSectionTitle>Абонементы</DoctorSectionTitle>
          {!readOnly ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-primary hover:text-primary"
              aria-label="Новый абонемент"
              title="Новый абонемент"
              onClick={openCreateForm}
            >
              <BadgePlus className="size-6" aria-hidden />
            </Button>
          ) : null}
        </DoctorSectionHeader>

        <div className="mt-3 flex items-center justify-between gap-3 border-y border-border/60 bg-muted/30 px-[var(--doctor-block-padding,18px)] py-2">
          <DoctorResultCount
            className="min-w-0 py-0"
            label={packageView === 'active' ? 'Активных' : 'В архиве'}
            value={visiblePackages.length}
          />
          <DoctorSectionActions className="shrink-0 flex-nowrap gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className={cn(
                packageView === 'archived' &&
                  'border-primary bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary',
              )}
              aria-label={packageView === 'active' ? 'Показать архивные' : 'Показать активные'}
              aria-pressed={packageView === 'archived'}
              title="Архив"
              onClick={() => setPackageView((view) => (view === 'active' ? 'archived' : 'active'))}
            >
              <Archive className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setSoldOpen(true);
              }}
            >
              <ShoppingBag className="size-4" aria-hidden />
              Проданные
            </Button>
          </DoctorSectionActions>
        </div>

        {visiblePackages.length > 0 ? (
          <DoctorDnaFlatList>
            {visiblePackages.map((pkg) => {
              const totalSessions = pkg.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <li key={pkg.id}>
                  <button
                    type="button"
                    className={cn(
                      doctorDnaFlatListRowClass,
                      doctorDnaFlatListClickableClass,
                      'grid w-full grid-cols-[minmax(0,1fr)_auto] text-left',
                    )}
                    onClick={() => {
                      setSelectedCatalogPackage(pkg);
                      if (!soldPackages) void loadSoldPackages();
                    }}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-base font-normal text-foreground">
                        {pkg.title}
                      </span>
                      <span className="truncate text-sm text-muted-foreground">
                        {pkg.items.length} {pluralizeServices(pkg.items.length)} · {totalSessions}{' '}
                        {pluralizeSessions(totalSessions)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex flex-col items-end gap-0.5 text-sm">
                        <span>{formatPackageMoney(pkg.priceMinor, pkg.currency)}</span>
                        <span className="text-muted-foreground">
                          {formatValidityDays(pkg.validityDays)}
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </DoctorDnaFlatList>
        ) : (
          <DoctorEmptyState>
            {packageView === 'active' ? 'Активных абонементов нет' : 'Архивных абонементов нет'}
          </DoctorEmptyState>
        )}
      </DoctorSection>

      <DoctorModal
        open={packageFormOpen}
        onClose={closePackageForm}
        title={editingPackage ? 'Изменить абонемент' : 'Новый абонемент'}
        nested={editingPackage != null}
        desktopPresentation="right-sheet"
        footer={
          <>
            <Button type="button" size="sm" variant="outline" onClick={closePackageForm}>
              Отмена
            </Button>
            <Button type="button" size="sm" disabled={formPending} onClick={savePackage}>
              {editingPackage ? 'Сохранить' : 'Добавить'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-title">Название</Label>
            <Input
              id="pkg-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Курс 10 занятий"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Стоимость, ₽</Label>
              <Input
                id="pkg-price"
                inputMode="decimal"
                value={priceRub}
                onChange={(event) => setPriceRub(event.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-days">Срок, дней</Label>
              <Input
                id="pkg-days"
                inputMode="numeric"
                value={validityDays}
                onChange={(event) => setValidityDays(event.target.value)}
                placeholder="30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Состав</Label>
            {formItems.length > 0 ? (
              <ul className="m-0 list-none space-y-1.5 p-0">
                {formItems.map((item, index) => {
                  const service = activeServices.find(
                    (candidate) => candidate.id === item.serviceId,
                  );
                  return (
                    <li
                      key={`${item.serviceId}:${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span>
                        {service?.title ?? item.serviceId} × {item.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeFormItem(index)}
                      >
                        Убрать
                      </Button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="pkg-service">Услуга</Label>
                <Select
                  value={itemServiceId}
                  onValueChange={(value) => setItemServiceId(value ?? '')}
                >
                  <SelectTrigger
                    id="pkg-service"
                    displayLabel={
                      activeServices.find((service) => service.id === itemServiceId)?.title ??
                      'Выберите услугу'
                    }
                  />
                  <SelectContent>
                    {activeServices.map((service) => (
                      <SelectItem key={service.id} value={service.id} label={service.title}>
                        {service.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pkg-quantity">Сеансов</Label>
                <Input
                  id="pkg-quantity"
                  inputMode="numeric"
                  value={itemQuantity}
                  onChange={(event) => setItemQuantity(event.target.value)}
                  placeholder="1"
                />
              </div>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addFormItem}>
              Добавить услугу
            </Button>
          </div>
        </div>
      </DoctorModal>

      <DoctorModal
        open={selectedCatalogPackage != null}
        onClose={() => setSelectedCatalogPackage(null)}
        title={
          <DoctorModalCompositeTitle label="Абонемент" entity={selectedCatalogPackage?.title} />
        }
        desktopPresentation="right-sheet"
        footer={
          selectedCatalogPackage && !readOnly ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => toggleActive(selectedCatalogPackage)}
              >
                {selectedCatalogPackage.isActive ? 'В архив' : 'Вернуть'}
              </Button>
              <Button type="button" size="sm" onClick={() => openEditForm(selectedCatalogPackage)}>
                Изменить
              </Button>
            </>
          ) : null
        }
      >
        {selectedCatalogPackage ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Стоимость</dt>
              <dd>
                {formatPackageMoney(
                  selectedCatalogPackage.priceMinor,
                  selectedCatalogPackage.currency,
                )}
              </dd>
              <dt className="text-muted-foreground">Срок действия</dt>
              <dd>{formatValidityDays(selectedCatalogPackage.validityDays)}</dd>
              <dt className="text-muted-foreground">Продано</dt>
              <dd>{selectedCatalogSoldCount ?? 'Загрузка…'}</dd>
            </dl>
            <div className="space-y-2">
              <p className="text-sm font-medium">Состав</p>
              <ul className="m-0 list-none space-y-1 p-0">
                {selectedCatalogPackage.items.map((item) => {
                  const service = state.services.find(
                    (candidate) => candidate.id === item.serviceId,
                  );
                  return (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 text-sm"
                    >
                      <span>{service?.title ?? 'Услуга'}</span>
                      <span className="text-muted-foreground">
                        {item.quantity} {pluralizeSessions(item.quantity)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </DoctorModal>

      <DoctorSoldMembershipsModal
        open={soldOpen}
        onOpenChange={setSoldOpen}
        readOnly={readOnly}
        onPackagesLoaded={setSoldPackages}
      />
    </>
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
    setActiveSectionState((prev) =>
      prev === resolvedExternalSection ? prev : resolvedExternalSection,
    );
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
      isActive === false || setupPackagesOnly ? null : (
        <DoctorMobileSectionTabs
          tabs={visibleSections}
          activeTab={activeSection}
          onTabChange={setActiveSection}
          ariaLabel="Разделы настроек"
          scrollable
        />
      ),
    [activeSection, isActive, setActiveSection, setupPackagesOnly, visibleSections],
  );

  return (
    <div
      className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 md:mx-0 md:px-0 [scrollbar-width:thin]"
      data-testid="schedule-setup-tab"
    >
      <DoctorShellMobileSubsectionTabsRegistration content={mobileSubsectionTabs} />
      <div className="flex flex-col gap-3 py-3">
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
    </div>
  );
}
