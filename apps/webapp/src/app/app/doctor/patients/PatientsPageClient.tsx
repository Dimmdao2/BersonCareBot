'use client';

/**
 * PatientsPageClient — unified patients list.
 *
 * Layout (desktop, 2-column):
 *   LEFT  – patient list with count and sorting
 *   RIGHT – filter panel
 *
 * A client-row click opens the FULL patient card directly (no right-pane preview).
 *
 * Search logic: debounced client-side match across the loaded organization roster.
 */

import {
  Suspense,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarDays,
  Dumbbell,
  Filter,
  Handshake,
  Search,
  Ticket,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClientListItem, DoctorDashboardPatientMetrics } from '@/modules/doctor-clients/ports';
import { DoctorMetricList } from '@/shared/ui/doctor/DoctorMetricList';
import { DoctorStatCard } from '@/app/app/doctor/analytics/clients/DoctorStatCard';
import { Button, buttonVariants } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorNewClientAction } from '@/shared/ui/doctor/DoctorNewClientAction';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { TooltipProvider } from '@/shared/ui/doctor/primitives/tooltip';
import {
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { DOCTOR_MOBILE_SCROLL_END_INSET_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { CatalogRightPane } from '@/shared/ui/doctor/catalog/CatalogRightPane';
import { formatDoctorFio } from '@/shared/lib/fio';
import {
  buildPatientListWorkspaceHref,
  patientCardHrefWithReturnTo,
  type PatientListChannel,
  type PatientListSegmentKey,
  type PatientListSort,
  type PatientListSortDirection,
  type PatientListWorkspaceState,
} from './patientListWorkspaceState';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Категория клиента — грубая классификация по вовлечённости.
 *
 *  - `client`          — есть записи/визиты, активное сопровождение, программа или абонемент
 *  - `subscriber_only` — зарегистрирован, но ничего из вышеперечисленного
 *  - `all`             — все пациенты (нет фильтра по категории)
 *
 * Категория «потенциальный» (есть чат, нет записей) не может быть определена
 * только по флагам списка, поэтому используем «подписчик» как самую широкую
 * незадействованную категорию.
 */
export type ClientCategory = 'all' | 'client' | 'subscriber_only';
type ClientListSort = PatientListSort;
type ClientListSortDirection = PatientListSortDirection;

export type PatientsPageClientProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  initialFilters: PatientListWorkspaceState;
  patientPluralLabel?: string;
  /** Именительный ед.ч. из настройки терминологии («Пациент»/«Клиент») — используется для кнопки/диалога создания. */
  patientSingularLabel?: string;
  displayIana?: string;
};

// Legacy per-button filter state (mirrors old DoctorClientsPanel ClientFiltersState)
type LegacyFiltersState = {
  telegram: boolean;
  max: boolean;
  email: boolean;
  phone: boolean;
  visitedMonth: boolean;
  cancellations: boolean;
  reschedules: boolean;
  withoutAppointments: boolean;
  memberships: boolean;
  archive: boolean;
};

// ---------------------------------------------------------------------------
// Segment definitions (merged: old 4-card model + new extended segments)
// ---------------------------------------------------------------------------

type SegmentKey = 'all' | PatientListSegmentKey;

type SegmentDef = {
  key: SegmentKey;
  title: string;
  tooltip: string;
};

const SEGMENTS: SegmentDef[] = [
  { key: 'all', title: 'Все', tooltip: 'Все люди организации.' },
  {
    key: 'appointments',
    title: 'С записями',
    tooltip: 'Есть будущая или прошедшая запись без отмены.',
  },
  {
    key: 'on_support',
    title: 'На сопровождении',
    tooltip: 'Сейчас на активном сопровождении.',
  },
  {
    key: 'with_program',
    title: 'С программой',
    tooltip: 'Есть активная программа.',
  },
  {
    key: 'without_appointments',
    title: 'Без приёмов',
    tooltip: 'Нет визитов и будущих записей.',
  },
  {
    key: 'visits',
    title: 'С визитами',
    tooltip: 'Есть состоявшийся визит.',
  },
  {
    key: 'former',
    title: 'Без будущих',
    tooltip: 'Визиты были, будущих записей нет.',
  },
  {
    key: 'cancellations',
    title: 'С отменами',
    tooltip: 'Есть хотя бы одна отмена за всё время.',
  },
  {
    key: 'reschedules',
    title: 'С переносами',
    tooltip: 'Есть хотя бы один перенос за всё время.',
  },
  {
    key: 'memberships',
    title: 'С абонементами',
    tooltip: 'Есть действующий абонемент.',
  },
  {
    key: 'expired_memberships',
    title: 'Истёкшие абонементы',
    tooltip: 'Есть истёкший абонемент.',
  },
  {
    key: 'visited_month',
    title: 'Приём в этом мес.',
    tooltip: 'Есть визит в текущем месяце.',
  },
];

// ---------------------------------------------------------------------------
/**
 * Exported (not just page-local) so the underlying channel-filter mechanism stays covered by a
 * direct test even while its UI is hidden — see `CHANNEL_FILTERS_UI_ENABLED` below.
 */
export function applyChannelFilter(
  list: ClientListItem[],
  activeChannel: PatientListChannel | null,
): ClientListItem[] {
  if (activeChannel === 'telegram') {
    return list.filter(
      (c) => Boolean(c.bindings.telegramId?.trim()) && !c.bindings.telegramBotBlocked,
    );
  }
  if (activeChannel === 'max') {
    return list.filter((c) => Boolean(c.bindings.maxId?.trim()) && !c.bindings.maxBotBlocked);
  }
  if (activeChannel === 'email') {
    return list.filter((c) => c.hasEmail === true);
  }
  if (activeChannel === 'phone') {
    return list.filter((c) => Boolean(c.phone?.trim()));
  }
  if (activeChannel === 'web_push') {
    return list.filter((c) => c.hasWebPush === true);
  }
  return list;
}

/**
 * Owner punch-list item 4 (CLI-5): hide the communication-channel filter buttons from the right pane
 * while keeping every prop/state/URL-param wire-up they depend on intact (see the block that reads
 * this flag further down).
 *
 * 🔴 НЕ ВКЛЮЧАТЬ БЕЗ ПРЯМОГО УКАЗАНИЯ ВЛАДЕЛЬЦА (его распоряжение 2026-07-27).
 * `false` здесь — это ВЫПОЛНЕННОЕ требование, а не незаконченная работа и не забытый флаг. Владелец
 * просил убрать фильтр СО СТРАНИЦЫ, но не удалять код. Не «чинить», не включать «чтобы не пропадало»,
 * не заводить задачу «доделать фильтр по каналам». Вернуть `true` можно только по его явной команде.
 *
 * Do NOT flip this to `true` on your own initiative — see the rule above.
 */
const CHANNEL_FILTERS_UI_ENABLED = false;

/**
 * Muted "active" tone for the sort toggles (owner punch-list item 5: the old solid
 * `variant="default"` primary fill read as too strong). Same tint DoctorStatCard already uses for
 * a selected segment card — keeps the active-state language consistent across the page.
 */
const doctorDnaActiveSortToneClass =
  'border-primary/35 bg-primary/15 text-primary hover:border-primary/40 hover:bg-primary/20 hover:text-primary';

const DEFAULT_LEGACY_FILTERS: LegacyFiltersState = {
  telegram: false,
  max: false,
  email: false,
  phone: false,
  visitedMonth: false,
  cancellations: false,
  reschedules: false,
  withoutAppointments: false,
  memberships: false,
  archive: false,
};

// ---------------------------------------------------------------------------
// Client-side segment predicate
// ---------------------------------------------------------------------------

function clientSegmentPredicate(item: ClientListItem, key: SegmentKey): boolean {
  switch (key) {
    case 'all':
      return true;
    case 'appointments':
      return (item.activeAppointmentsCount ?? 0) > 0 || (item.hasAppointmentHistory ?? false);
    case 'on_support':
      return item.isOnSupport === true;
    case 'with_program':
      return item.activeTreatmentProgram === true;
    case 'without_appointments':
      return !(item.hasAppointmentHistory ?? false) && (item.activeAppointmentsCount ?? 0) === 0;
    case 'visits':
      return item.lastAppointmentAt != null;
    case 'former':
      return item.lastAppointmentAt != null && (item.activeAppointmentsCount ?? 0) === 0;
    case 'cancellations':
      return item.cancellationsCount > 0;
    case 'reschedules':
      return item.reschedulesCount > 0;
    case 'memberships':
      return item.hasActiveMemberships === true;
    case 'expired_memberships':
      return item.hasExpiredMemberships === true;
    case 'visited_month':
      return item.visitedThisCalendarMonth === true;
    default:
      return true;
  }
}

function applySegmentFilters(
  list: ClientListItem[],
  activeSegments: SegmentKey[],
): ClientListItem[] {
  if (activeSegments.length === 0) return list;
  return list.filter((item) => activeSegments.every((key) => clientSegmentPredicate(item, key)));
}

// ---------------------------------------------------------------------------
// ClientCategory filter (S4.2)
// ---------------------------------------------------------------------------

/** Определяет категорию клиента по флагам из ClientListItem. */
export function getClientCategory(item: ClientListItem): Exclude<ClientCategory, 'all'> {
  const isClient =
    item.isOnSupport === true ||
    item.activeTreatmentProgram === true ||
    (item.hasAppointmentHistory ?? false) ||
    (item.activeAppointmentsCount ?? 0) > 0 ||
    item.hasMemberships === true;
  return isClient ? 'client' : 'subscriber_only';
}

function applyCategoryFilter(list: ClientListItem[], category: ClientCategory): ClientListItem[] {
  if (category === 'all') return list;
  return list.filter((item) => getClientCategory(item) === category);
}

function clientFioSortKey(item: ClientListItem): string {
  return formatDoctorFio(
    {
      lastName: item.lastName ?? null,
      firstName: item.firstName ?? null,
      patronymic: item.patronymic ?? null,
    },
    item.displayName,
  ).trim();
}

function compareClientsByFio(a: ClientListItem, b: ClientListItem): number {
  const fioCompare = clientFioSortKey(a).localeCompare(clientFioSortKey(b), 'ru');
  if (fioCompare !== 0) return fioCompare;
  return a.userId.localeCompare(b.userId, 'ru');
}

function sortClients(
  list: ClientListItem[],
  sort: ClientListSort,
  direction: ClientListSortDirection,
): ClientListItem[] {
  return [...list].sort((a, b) => {
    if (sort === 'fio') {
      const fioCompare = clientFioSortKey(a).localeCompare(clientFioSortKey(b), 'ru');
      if (fioCompare !== 0) return direction === 'asc' ? fioCompare : -fioCompare;
      return a.userId.localeCompare(b.userId, 'ru');
    }
    if (a.lastAppointmentAt && b.lastAppointmentAt) {
      const appointmentCompare = a.lastAppointmentAt.localeCompare(b.lastAppointmentAt);
      if (appointmentCompare !== 0)
        return direction === 'asc' ? appointmentCompare : -appointmentCompare;
    } else if (a.lastAppointmentAt) {
      return -1;
    } else if (b.lastAppointmentAt) {
      return 1;
    }
    return compareClientsByFio(a, b);
  });
}

function clientPrimaryName(item: ClientListItem): string {
  return formatDoctorFio(
    {
      lastName: item.lastName ?? null,
      firstName: item.firstName ?? null,
      patronymic: item.patronymic ?? null,
    },
    item.displayName.trim() || '—',
  );
}

// ---------------------------------------------------------------------------
// Segment count helper (computed from allClients using clientSegmentPredicate)
// ---------------------------------------------------------------------------

function getSegmentCount(
  key: SegmentKey,
  _metrics: DoctorDashboardPatientMetrics,
  clients: ClientListItem[],
): number | null {
  if (key === 'all') return clients.length;
  return clients.filter((item) => clientSegmentPredicate(item, key)).length;
}

function renderSegmentMetricValue(current: number | string, total: number | null): ReactNode {
  if (typeof current !== 'number' || total === null || current === total) return current;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{total}</span>
      <span
        className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums leading-none text-muted-foreground"
        aria-label={`После фильтров: ${current}`}
      >
        <Filter className="size-3" aria-hidden />
        {current}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// IconSlot (patient list row)
// ---------------------------------------------------------------------------

function iconBadge(value: number | null): ReactNode {
  if (!value || value <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 inline-flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none text-primary-foreground">
      {value}
    </span>
  );
}

type IconSlotProps = {
  visible: boolean;
  label: string;
  badge?: number;
  className?: string;
  children: ReactNode;
};

function IconSlot({ visible, label, badge, className, children }: IconSlotProps) {
  if (!visible) {
    return <span className="size-7" aria-hidden />;
  }
  return (
    <span className={cn('inline-flex size-7 shrink-0 items-center justify-center', className)}>
      <span
        className="relative inline-flex size-6 items-center justify-center text-muted-foreground"
        aria-label={label}
      >
        {children}
        {iconBadge(badge ?? 0)}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// List skeleton (swapped: list left, compact filter right)
// ---------------------------------------------------------------------------

function PatientListSkeleton() {
  return (
    <div className="grid gap-3 lg:min-h-0 lg:grid-cols-2 lg:items-start">
      {/* List skeleton — left */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border/60 px-5 py-2">
          <div className="h-6 w-full animate-pulse rounded bg-muted/50" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mx-2 mb-1.5 mt-1.5 h-10 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
      {/* Filter skeleton — right */}
      <div className="rounded-lg border border-border bg-card p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 animate-pulse rounded bg-muted/50" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content (Suspense boundary — uses `use()`)
// ---------------------------------------------------------------------------

type PatientsContentProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  patientPluralLabel: string;
  patientSingularLabel: string;
  activeSegments: SegmentKey[];
  activeChannel: PatientListChannel | null;
  archivedOnly: boolean;
  searchQuery: string;
  searchInput: string;
  legacyFilters: LegacyFiltersState;
  isListPending: boolean;
  mobileFiltersOpen: boolean;
  sort: ClientListSort;
  sortDirection: ClientListSortDirection;
  listScrollTop: number;
  workspaceState: PatientListWorkspaceState;
  onSortSelect: (sort: ClientListSort) => void;
  onListScroll: (scrollTop: number) => void;
  onSegmentToggle: (key: SegmentKey) => void;
  onChannelChange: (channel: PatientListChannel | null, archived: boolean) => void;
  onClearSearch: () => void;
  onSearchInput: (value: string) => void;
  onMobileFiltersOpenChange: (open: boolean) => void;
};

function PatientsContent({
  listPromise,
  metricsPromise,
  patientPluralLabel,
  patientSingularLabel,
  activeSegments,
  activeChannel,
  archivedOnly,
  searchQuery,
  searchInput,
  legacyFilters,
  isListPending,
  mobileFiltersOpen,
  sort,
  sortDirection,
  listScrollTop,
  workspaceState,
  onSortSelect,
  onListScroll,
  onSegmentToggle,
  onChannelChange,
  onClearSearch,
  onSearchInput,
  onMobileFiltersOpenChange,
}: PatientsContentProps) {
  const router = useRouter();
  const allClients = use(listPromise);
  const metrics = use(metricsPromise);
  const activeCategory: ClientCategory = 'all';
  const listRef = useRef<HTMLUListElement>(null);

  // Context base for segment card counts (PAT-02/06/#540):
  // KPI cards are multi-select filters with AND policy. Each card shows the
  // count for its own segment after all other selected KPI filters are applied,
  // followed by the full total for that segment in the current category.
  const categoryBase = useMemo(
    () => applyCategoryFilter(allClients, activeCategory),
    [allClients, activeCategory],
  );
  const filteredBySegments = useMemo(
    () => applySegmentFilters(categoryBase, activeSegments),
    [categoryBase, activeSegments],
  );

  // PAT-CLIENTS-1: filter+sort is real work (localeCompare sort over the whole roster) and must NOT
  // recompute on every render. Before this was memoized it recomputed synchronously on every native
  // `scroll` event (see onListScroll below), which — combined with the scrollTop restore effect —
  // produced the reported jitter: heavy work delayed the DOM `scrollTop` write-back, which then
  // "snapped" the list to a stale position while the user was still actively scrolling.
  const filtered = useMemo(() => {
    // Apply category filter first, then segment, channel, and legacy filters.
    let list = applySegmentFilters(categoryBase, activeSegments);
    list = applyChannelFilter(list, activeChannel);
    // Legacy filters (AND-logic)
    if (legacyFilters.cancellations) list = list.filter((c) => c.cancellationsCount > 0);
    if (legacyFilters.visitedMonth) list = list.filter((c) => c.visitedThisCalendarMonth === true);
    if (legacyFilters.withoutAppointments)
      list = list.filter(
        (c) => !(c.hasAppointmentHistory ?? false) && (c.activeAppointmentsCount ?? 0) === 0,
      );
    if (legacyFilters.memberships) list = list.filter((c) => c.hasActiveMemberships === true);
    if (legacyFilters.reschedules) list = list.filter((c) => c.reschedulesCount > 0);

    // PAT-09/10: client-side text search across all name fields
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.displayName?.toLowerCase().includes(q) ||
          c.firstName?.toLowerCase().includes(q) ||
          c.lastName?.toLowerCase().includes(q) ||
          c.patronymic?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q),
      );
    }
    return sortClients(list, sort, sortDirection);
  }, [
    categoryBase,
    activeSegments,
    activeChannel,
    legacyFilters,
    searchQuery,
    sort,
    sortDirection,
  ]);

  // Restores/pins the DOM scroll position from state (e.g. on initial mount, or when the filtered
  // list identity changes). `listScrollTop` itself is now committed by the parent on a debounce
  // (see PatientsPageClient.handleListScroll), so this effect no longer fights the user's own
  // in-flight scroll gesture — by the time it fires, `listScrollTop` already matches reality.
  useEffect(() => {
    const list = listRef.current;
    if (!list || Math.abs(list.scrollTop - listScrollTop) < 1) return;
    list.scrollTop = listScrollTop;
  }, [filtered.length, listScrollTop]);

  // Determine if any filter is active (for "найдено N" header)
  const isAnyFilterActive =
    activeCategory !== 'all' ||
    activeSegments.length > 0 ||
    activeChannel !== null ||
    legacyFilters.cancellations ||
    legacyFilters.visitedMonth ||
    legacyFilters.withoutAppointments ||
    legacyFilters.memberships ||
    legacyFilters.reschedules ||
    !!searchQuery.trim();

  const patientPluralLabelLower = patientPluralLabel.toLocaleLowerCase('ru-RU');

  const renderSortControls = () => (
    <div
      className="flex min-w-0 flex-wrap items-center justify-between gap-2"
      aria-label={`Сортировка: ${patientPluralLabelLower}`}
    >
      <span className="text-sm">Сортировать</span>
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(
            'h-8 gap-1.5 px-2 text-xs',
            sort === 'recent_appointments' && doctorDnaActiveSortToneClass,
          )}
          aria-pressed={sort === 'recent_appointments'}
          aria-label={`Недавние: ${sort === 'recent_appointments' && sortDirection === 'asc' ? 'давние сверху' : 'недавние сверху'}`}
          onClick={() => onSortSelect('recent_appointments')}
        >
          Недавние
          {sort === 'recent_appointments' ? (
            sortDirection === 'desc' ? (
              <ArrowDown className="size-3.5" aria-hidden />
            ) : (
              <ArrowUp className="size-3.5" aria-hidden />
            )
          ) : null}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn('h-8 gap-1.5 px-2 text-xs', sort === 'fio' && doctorDnaActiveSortToneClass)}
          aria-pressed={sort === 'fio'}
          aria-label={`По фамилии: ${sort === 'fio' && sortDirection === 'desc' ? 'Я–А' : 'А–Я'}`}
          onClick={() => onSortSelect('fio')}
        >
          По фамилии
          {sort === 'fio' ? (
            sortDirection === 'asc' ? (
              <ArrowDown className="size-3.5" aria-hidden />
            ) : (
              <ArrowUp className="size-3.5" aria-hidden />
            )
          ) : null}
        </Button>
      </div>
    </div>
  );

  const renderFilters = (idPrefix: string, mobile = false) => (
    <div className="flex min-h-0 flex-col gap-3">
      {renderSortControls()}
      <div className="border-t border-border/60 pt-3">
        <TooltipProvider delay={450}>
          <DoctorMetricList
            className={cn(
              'gap-1.5',
              mobile ? 'grid-cols-2' : 'grid-cols-3 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3',
            )}
          >
            {SEGMENTS.map((seg) => {
              const segmentContextBase =
                seg.key === 'all'
                  ? categoryBase
                  : applySegmentFilters(
                      categoryBase,
                      activeSegments.filter((key) => key !== seg.key),
                    );
              const currentValue =
                seg.key === 'all'
                  ? filteredBySegments.length
                  : (getSegmentCount(seg.key, metrics, segmentContextBase) ?? '—');
              const totalValue =
                seg.key === 'all'
                  ? categoryBase.length
                  : getSegmentCount(seg.key, metrics, categoryBase);
              return (
                <DoctorStatCard
                  key={seg.key}
                  id={`${idPrefix}-segment-${seg.key}`}
                  title={seg.key === 'all' ? `Все ${patientPluralLabelLower}` : seg.title}
                  value={renderSegmentMetricValue(currentValue, totalValue)}
                  tooltip={
                    seg.key === 'all'
                      ? `Все ${patientPluralLabelLower} этой организации.`
                      : seg.tooltip
                  }
                  selected={
                    seg.key === 'all'
                      ? activeSegments.length === 0 && !archivedOnly
                      : activeSegments.includes(seg.key)
                  }
                  onClick={() => onSegmentToggle(seg.key)}
                />
              );
            })}
          </DoctorMetricList>
        </TooltipProvider>
      </div>
    </div>
  );

  const renderListControls = (mobile: boolean) => (
    <div
      className={cn(
        'flex shrink-0 flex-col bg-card',
        mobile ? 'gap-1.5' : 'z-10 border-b border-border/60',
      )}
    >
      <div
        className={cn(
          mobile ? '' : 'border-b border-border/40 px-[var(--doctor-block-padding,18px)] py-2',
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">
              <Search className="size-3.5" aria-hidden />
            </span>
            <Input
              type="search"
              placeholder="Поиск по ФИО и контактам"
              value={searchInput}
              onChange={(event) => onSearchInput(event.target.value)}
              className="h-8 pl-8 pr-8 text-sm"
              aria-label="Поиск по ФИО и контактам"
            />
            {searchInput ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onClearSearch}
                className="absolute inset-y-0 right-0 my-auto size-8 text-muted-foreground hover:text-foreground"
                aria-label="Сбросить поиск"
              >
                <X className="size-3.5" />
              </Button>
            ) : null}
          </div>
          {mobile ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="size-8 shrink-0"
              onClick={() => onMobileFiltersOpenChange(true)}
              aria-label="Фильтры"
            >
              <Filter className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2',
          mobile ? '' : 'px-[var(--doctor-block-padding,18px)] py-2',
        )}
      >
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {isAnyFilterActive ? (
            <>
              найдено {filtered.length} / {categoryBase.length}
            </>
          ) : activeCategory === 'all' ? (
            <>
              {patientPluralLabel}: {allClients.length}
            </>
          ) : (
            <>
              {patientPluralLabel}: {categoryBase.length}
            </>
          )}
          {isListPending && <span className="ml-1 animate-pulse">…</span>}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <DoctorPageHeader
        id="doctor-patients-header"
        title={patientPluralLabel}
        tabs={<DoctorNewClientAction patientSingularLabel={patientSingularLabel} />}
        toolbar={renderListControls(true)}
        toolbarClassName="md:hidden"
      />
      <CatalogSplitLayout
        mobileEdgeToEdge
        splitFrom="md"
        desktopColsClassName="md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:grid-cols-2"
        mobileView="list"
        className="min-h-0 flex-1 md:overflow-hidden"
        left={
          <section
            data-doctor-flat-list-surface
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-none bg-card md:rounded-[var(--doctor-page-block-radius,12px)]"
          >
            <div className="hidden md:block">{renderListControls(false)}</div>

            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {searchQuery.trim()
                  ? 'Нет пациентов по запросу.'
                  : 'Нет пациентов по заданным фильтрам.'}
              </p>
            ) : (
              <ul
                ref={listRef}
                id="doctor-patients-list"
                className={cn(
                  doctorDnaFlatListClass,
                  DOCTOR_MOBILE_SCROLL_END_INSET_CLASS,
                  'mx-0 min-h-0 flex-1 overflow-y-auto [content-visibility:auto] md:mx-[var(--doctor-block-padding,18px)]',
                )}
                onScroll={(event) => onListScroll(event.currentTarget.scrollTop)}
              >
                {filtered.map((c, index) => {
                  const futureAppointmentCount = c.activeAppointmentsCount ?? 0;
                  const programOrSupervision = c.isOnSupport === true || c.activeTreatmentProgram;
                  const cardHref = patientCardHrefWithReturnTo(c.userId, workspaceState);
                  return (
                    <li key={c.userId} id={`doctor-patients-item-${c.userId}`}>
                      <Link
                        id={`doctor-patients-card-${c.userId}`}
                        href={cardHref}
                        prefetch={false}
                        onMouseEnter={() => router.prefetch(cardHref)}
                        onFocus={() => router.prefetch(cardHref)}
                        className={cn(
                          buttonVariants({ variant: 'ghost' }),
                          doctorDnaFlatListRowClass,
                          doctorDnaFlatListClickableClass,
                          'h-auto w-full rounded-none bg-transparent text-left shadow-none active:bg-muted/80 md:gap-3',
                          index === 0 && 'border-t-0',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <span className={cn('block truncate', doctorDnaFlatListPrimaryClass)}>
                            {clientPrimaryName(c)}
                          </span>
                        </div>
                        <div
                          className="grid w-[5.75rem] shrink-0 grid-cols-3 gap-1"
                          aria-label="Статусы клиента"
                        >
                          <IconSlot visible={c.hasMemberships === true} label="Есть абонемент">
                            <Ticket className="size-3.5" aria-hidden />
                          </IconSlot>
                          <IconSlot
                            visible={programOrSupervision}
                            label={
                              c.isOnSupport === true
                                ? 'Клиент на сопровождении'
                                : 'Назначенная программа'
                            }
                          >
                            {c.isOnSupport === true ? (
                              <Handshake className="size-3.5" aria-hidden />
                            ) : (
                              <Dumbbell className="size-3.5" aria-hidden />
                            )}
                          </IconSlot>
                          <IconSlot
                            visible={futureAppointmentCount > 0}
                            label={`Будущие записи: ${futureAppointmentCount}`}
                            badge={futureAppointmentCount}
                          >
                            <CalendarDays className="size-3.5" aria-hidden />
                          </IconSlot>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        }
        right={
          <CatalogRightPane
            className="hidden h-full bg-transparent md:flex"
            contentClassName="gap-3 p-0"
          >
            {/* Filter panel (right pane holds filters only) */}
            <section className="rounded-[var(--doctor-page-block-radius,12px)] border border-border bg-card p-[var(--doctor-block-padding,18px)]">
              {/* Factual filters in the desktop right panel. */}
              {renderFilters('doctor-patients')}

              {/*
                Communication-channel filters (owner punch-list item 4): UI hidden per owner request —
                the buttons duplicated info doctors rarely filtered by and cluttered the panel. The
                mechanism stays fully wired (activeChannel state, onChannelChange, applyChannelFilter,
                PatientListChannel/PATIENT_LIST_CHANNELS, the `channel` URL param) so this can be
                re-enabled by flipping the flag below without touching any plumbing. A channel still
                seeded via URL state (e.g. a saved/shared link) keeps filtering the list even with the
                buttons hidden — see the "keeps the communication-channel filter mechanism wired" test.
              */}
              {CHANNEL_FILTERS_UI_ENABLED ? (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Каналы связи</p>
                  <div id="doctor-patients-filters" className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant={activeChannel === 'telegram' ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        onChannelChange(activeChannel === 'telegram' ? null : 'telegram', false)
                      }
                      aria-pressed={activeChannel === 'telegram'}
                    >
                      Telegram
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeChannel === 'max' ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() => onChannelChange(activeChannel === 'max' ? null : 'max', false)}
                      aria-pressed={activeChannel === 'max'}
                    >
                      MAX
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeChannel === 'email' ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        onChannelChange(activeChannel === 'email' ? null : 'email', false)
                      }
                      aria-pressed={activeChannel === 'email'}
                    >
                      Email
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeChannel === 'phone' ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        onChannelChange(activeChannel === 'phone' ? null : 'phone', false)
                      }
                      aria-pressed={activeChannel === 'phone'}
                    >
                      Телефон
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeChannel === 'web_push' ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() =>
                        onChannelChange(activeChannel === 'web_push' ? null : 'web_push', false)
                      }
                      aria-pressed={activeChannel === 'web_push'}
                    >
                      <Bell className="mr-1 size-3.5" aria-hidden />
                      Пуш-уведомления
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          </CatalogRightPane>
        }
      />
      <DoctorModal
        open={mobileFiltersOpen}
        onClose={() => onMobileFiltersOpenChange(false)}
        title="Фильтры"
        size="lg"
      >
        {renderFilters('doctor-patients-modal', true)}
      </DoctorModal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root component — manages state + debounced search
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 200;
// See handleListScroll below — same delay as search debounce, reused deliberately for consistency.
const SCROLL_COMMIT_DEBOUNCE_MS = 200;

export function PatientsPageClient({
  listPromise: initialListPromise,
  metricsPromise,
  initialFilters,
  patientPluralLabel = 'Пациенты',
  patientSingularLabel = 'Пациент',
}: PatientsPageClientProps) {
  const isListPending = false;

  // Search state (local, debounced)
  const [searchInput, setSearchInput] = useState(initialFilters.q);
  const [searchQuery, setSearchQuery] = useState(initialFilters.q);
  const [listPromise, setListPromise] = useState<Promise<ClientListItem[]>>(initialListPromise);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Segment / channel / archive state (segment and channel are client-side only)
  const [activeSegments, setActiveSegments] = useState<PatientListSegmentKey[]>(
    initialFilters.segments,
  );
  const [activeChannel, setActiveChannel] = useState<PatientListChannel | null>(
    initialFilters.channel,
  );
  const [archivedOnly, setArchivedOnly] = useState(initialFilters.archivedOnly);

  // Legacy per-button filter state (client-side only)
  const [legacyFilters] = useState<LegacyFiltersState>(DEFAULT_LEGACY_FILTERS);

  // Category mechanism remains dormant/reversible; this page defaults to all organization people.
  const [sort, setSort] = useState<ClientListSort>(initialFilters.sort);
  const [sortDirection, setSortDirection] = useState<ClientListSortDirection>(
    initialFilters.sortDirection,
  );
  // `listScrollTop` is the COMMITTED scroll position (drives URL/history + the DOM-restore effect
  // in PatientsContent). It intentionally does NOT track every native `scroll` event — see
  // handleListScroll below for why that was the root cause of the reported scroll jitter.
  const [listScrollTop, setListScrollTop] = useState(initialFilters.scrollTop);
  const scrollTopRef = useRef(initialFilters.scrollTop);
  const scrollCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const workspaceState = useMemo<PatientListWorkspaceState>(
    () => ({
      q: searchInput,
      segments: activeSegments,
      channel: activeChannel,
      archivedOnly,
      sort,
      sortDirection,
      // Right-pane preview removed: a client-row click opens the full card directly,
      // so the list no longer tracks a selected patient.
      selectedPatientId: null,
      scrollTop: listScrollTop,
    }),
    [activeChannel, activeSegments, archivedOnly, listScrollTop, searchInput, sort, sortDirection],
  );

  useEffect(() => {
    const href = buildPatientListWorkspaceHref(workspaceState);
    window.history.replaceState(window.history.state, '', href);
  }, [workspaceState]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (scrollCommitTimerRef.current) clearTimeout(scrollCommitTimerRef.current);
    },
    [],
  );

  /**
   * Root cause of the reported "list jitters/jumps wildly on scroll": the native `scroll` handler
   * used to call `setListScrollTop` directly on every event. Each of those triggered a full
   * `PatientsContent` re-render (recomputing the filtered/sorted roster — see the `useMemo` there)
   * plus a `history.replaceState` call, all synchronously while the browser was still actively
   * scrolling. The DOM-restore effect in `PatientsContent` then wrote the (now-stale) captured
   * `scrollTop` back onto the list element, which "snapped" the list backwards mid-gesture.
   *
   * Fix: track the live value in a ref (no re-render) and only commit it to React state — which is
   * what feeds the URL/history and the restore effect — after the user pauses scrolling. By the
   * time the commit fires, the DOM's real `scrollTop` already matches, so the restore effect is a
   * no-op and nothing snaps.
   */
  const handleListScroll = useCallback((value: number) => {
    scrollTopRef.current = value;
    if (scrollCommitTimerRef.current) clearTimeout(scrollCommitTimerRef.current);
    scrollCommitTimerRef.current = setTimeout(() => {
      setListScrollTop(scrollTopRef.current);
    }, SCROLL_COMMIT_DEBOUNCE_MS);
  }, []);

  const handleSegmentToggle = useCallback((key: SegmentKey) => {
    // Segment filters are client-side only and combine via AND.
    setActiveSegments((prev) => {
      if (key === 'all') return [];
      return prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
    });
  }, []);

  const handleChannelChange = useCallback(
    (channel: PatientListChannel | null, archived: boolean) => {
      setActiveChannel(channel);
      setArchivedOnly(archived);
    },
    [],
  );

  const handleSearchInput = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    // PAT-10: debounce only — no API call, filtering is purely client-side
    debounceRef.current = setTimeout(() => {
      setSearchQuery(trimmed);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery('');
    // PAT-10: no fetchList call — client-side filtering resets automatically
  }, []);

  // Keep state in sync when server-side navigation occurs (Next.js router)
  useEffect(() => {
    setListPromise(initialListPromise);
    setSearchInput(initialFilters.q);
    setSearchQuery(initialFilters.q);
    setActiveSegments(initialFilters.segments);
    setActiveChannel(initialFilters.channel);
    setArchivedOnly(initialFilters.archivedOnly);
    setSort(initialFilters.sort);
    setSortDirection(initialFilters.sortDirection);
    setListScrollTop(initialFilters.scrollTop);
    scrollTopRef.current = initialFilters.scrollTop;
    if (scrollCommitTimerRef.current) clearTimeout(scrollCommitTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialListPromise]);

  const handleSortSelect = useCallback(
    (nextSort: ClientListSort) => {
      if (nextSort === sort) {
        setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setSort(nextSort);
      setSortDirection(nextSort === 'recent_appointments' ? 'desc' : 'asc');
    },
    [sort],
  );

  return (
    <Suspense fallback={<PatientListSkeleton />}>
      <PatientsContent
        listPromise={listPromise}
        metricsPromise={metricsPromise}
        patientPluralLabel={patientPluralLabel}
        patientSingularLabel={patientSingularLabel}
        activeSegments={activeSegments}
        activeChannel={activeChannel}
        archivedOnly={archivedOnly}
        searchQuery={searchQuery}
        searchInput={searchInput}
        legacyFilters={legacyFilters}
        isListPending={isListPending}
        mobileFiltersOpen={mobileFiltersOpen}
        sort={sort}
        sortDirection={sortDirection}
        listScrollTop={listScrollTop}
        workspaceState={workspaceState}
        onSortSelect={handleSortSelect}
        onListScroll={handleListScroll}
        onSegmentToggle={handleSegmentToggle}
        onChannelChange={handleChannelChange}
        onClearSearch={clearSearch}
        onSearchInput={handleSearchInput}
        onMobileFiltersOpenChange={setMobileFiltersOpen}
      />
    </Suspense>
  );
}
