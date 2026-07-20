"use client";

/**
 * PatientsPageClient — unified patients list.
 *
 * Layout (desktop, 2-column):
 *   LEFT  – patient list with count and sorting
 *   RIGHT – filter panel (segment stat cards + channel row + additional filters)
 *
 * Search logic: debounced client-side match across the loaded organization roster.
 */

import { Suspense, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Bell, CalendarDays, Dumbbell, Filter, Handshake, Search, Ticket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { ClientListItem, DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "@/app/app/doctor/analytics/clients/DoctorStatCard";
import { Button, buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { TooltipProvider } from "@/shared/ui/doctor/primitives/tooltip";
import { doctorDnaFlatListClass, doctorDnaFlatListClickableClass, doctorDnaFlatListPrimaryClass, doctorDnaFlatListRowClass } from "@/shared/ui/doctor/DoctorDnaFlatListRow";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { CatalogRightPane } from "@/shared/ui/doctor/catalog/CatalogRightPane";
import { formatDoctorFio } from "@/shared/lib/fio";

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
export type ClientCategory = "all" | "client" | "subscriber_only";
type ClientListSort = "recent_appointments" | "fio";
type ClientListSortDirection = "asc" | "desc";

type InitialFilters = {
  q: string;
  segment: string | null;
  archivedOnly: boolean;
};

export type PatientsPageClientProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  initialFilters: InitialFilters;
  patientPluralLabel?: string;
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

type SegmentKey =
  | "all"
  | "appointments"
  | "on_support"
  | "with_program"
  | "without_appointments"
  | "visits"
  | "former"
  | "cancellations"
  | "reschedules"
  | "memberships"
  | "expired_memberships"
  | "visited_month";

type SegmentDef = {
  key: SegmentKey;
  title: string;
  tooltip: string;
  /** URL param value (null = no filter / "Все") */
  urlValue: string | null;
};

const SEGMENTS: SegmentDef[] = [
  { key: "all", title: "Все", tooltip: "Все люди организации.", urlValue: null },
  {
    key: "appointments",
    title: "С записями",
    tooltip: "Есть будущая или прошедшая запись без отмены.",
    urlValue: "appointments",
  },
  {
    key: "on_support",
    title: "На сопровождении",
    tooltip: "Сейчас на активном сопровождении.",
    urlValue: "on_support",
  },
  {
    key: "with_program",
    title: "С программой",
    tooltip: "Есть активная программа.",
    urlValue: "with_program",
  },
  {
    key: "without_appointments",
    title: "Без приёмов",
    tooltip: "Нет визитов и будущих записей.",
    urlValue: "without_appointments",
  },
  {
    key: "visits",
    title: "С визитами",
    tooltip: "Есть состоявшийся визит.",
    urlValue: "visits",
  },
  {
    key: "former",
    title: "Без будущих",
    tooltip: "Визиты были, будущих записей нет.",
    urlValue: "former",
  },
  {
    key: "cancellations",
    title: "С отменами",
    tooltip: "Есть хотя бы одна отмена за всё время.",
    urlValue: "cancellations",
  },
  {
    key: "reschedules",
    title: "С переносами",
    tooltip: "Есть хотя бы один перенос за всё время.",
    urlValue: "reschedules",
  },
  {
    key: "memberships",
    title: "С абонементами",
    tooltip: "Есть действующий абонемент.",
    urlValue: "memberships",
  },
  {
    key: "expired_memberships",
    title: "Истёкшие абонементы",
    tooltip: "Есть истёкший абонемент.",
    urlValue: "expired_memberships",
  },
  {
    key: "visited_month",
    title: "Приём в этом мес.",
    tooltip: "Есть визит в текущем месяце.",
    urlValue: "visited_month",
  },
];

function segmentKeyFromUrl(value: string | null): SegmentKey[] {
  if (!value || value === "all") return [];
  const segment = SEGMENTS.find((item) => item.urlValue === value);
  return segment && segment.key !== "all" ? [segment.key] : [];
}

// ---------------------------------------------------------------------------
function applyChannelFilter(list: ClientListItem[], activeChannel: string | null): ClientListItem[] {
  if (activeChannel === "telegram") {
    return list.filter((c) => Boolean(c.bindings.telegramId?.trim()) && !c.bindings.telegramBotBlocked);
  }
  if (activeChannel === "max") {
    return list.filter((c) => Boolean(c.bindings.maxId?.trim()) && !c.bindings.maxBotBlocked);
  }
  if (activeChannel === "email") {
    return list.filter((c) => c.hasEmail === true);
  }
  if (activeChannel === "phone") {
    return list.filter((c) => Boolean(c.phone?.trim()));
  }
  if (activeChannel === "web_push") {
    return list.filter((c) => c.hasWebPush === true);
  }
  return list;
}

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
    case "all":
      return true;
    case "appointments":
      return (item.activeAppointmentsCount ?? 0) > 0 || (item.hasAppointmentHistory ?? false);
    case "on_support":
      return item.isOnSupport === true;
    case "with_program":
      return item.activeTreatmentProgram === true;
    case "without_appointments":
      return !(item.hasAppointmentHistory ?? false) && (item.activeAppointmentsCount ?? 0) === 0;
    case "visits":
      return item.lastAppointmentAt != null;
    case "former":
      return item.lastAppointmentAt != null && (item.activeAppointmentsCount ?? 0) === 0;
    case "cancellations":
      return item.cancellationsCount > 0;
    case "reschedules":
      return item.reschedulesCount > 0;
    case "memberships":
      return item.hasActiveMemberships === true;
    case "expired_memberships":
      return item.hasExpiredMemberships === true;
    case "visited_month":
      return item.visitedThisCalendarMonth === true;
    default:
      return true;
  }
}

function applySegmentFilters(list: ClientListItem[], activeSegments: SegmentKey[]): ClientListItem[] {
  if (activeSegments.length === 0) return list;
  return list.filter((item) => activeSegments.every((key) => clientSegmentPredicate(item, key)));
}

// ---------------------------------------------------------------------------
// ClientCategory filter (S4.2)
// ---------------------------------------------------------------------------

/** Определяет категорию клиента по флагам из ClientListItem. */
export function getClientCategory(item: ClientListItem): Exclude<ClientCategory, "all"> {
  const isClient =
    item.isOnSupport === true || item.activeTreatmentProgram === true || (item.hasAppointmentHistory ?? false) || (item.activeAppointmentsCount ?? 0) > 0 || item.hasMemberships === true;
  return isClient ? "client" : "subscriber_only";
}

function applyCategoryFilter(list: ClientListItem[], category: ClientCategory): ClientListItem[] {
  if (category === "all") return list;
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
  const fioCompare = clientFioSortKey(a).localeCompare(clientFioSortKey(b), "ru");
  if (fioCompare !== 0) return fioCompare;
  return a.userId.localeCompare(b.userId, "ru");
}

function sortClients(list: ClientListItem[], sort: ClientListSort, direction: ClientListSortDirection): ClientListItem[] {
  return [...list].sort((a, b) => {
    if (sort === "fio") {
      const fioCompare = clientFioSortKey(a).localeCompare(clientFioSortKey(b), "ru");
      if (fioCompare !== 0) return direction === "asc" ? fioCompare : -fioCompare;
      return a.userId.localeCompare(b.userId, "ru");
    }
    if (a.lastAppointmentAt && b.lastAppointmentAt) {
      const appointmentCompare = a.lastAppointmentAt.localeCompare(b.lastAppointmentAt);
      if (appointmentCompare !== 0) return direction === "asc" ? appointmentCompare : -appointmentCompare;
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
    item.displayName.trim() || "—",
  );
}

// ---------------------------------------------------------------------------
// Segment count helper (computed from allClients using clientSegmentPredicate)
// ---------------------------------------------------------------------------

function getSegmentCount(key: SegmentKey, _metrics: DoctorDashboardPatientMetrics, clients: ClientListItem[]): number | null {
  if (key === "all") return clients.length;
  return clients.filter((item) => clientSegmentPredicate(item, key)).length;
}

function renderSegmentMetricValue(current: number | string, total: number | null): ReactNode {
  if (typeof current !== "number" || total === null || current === total) return current;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{total}</span>
      <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums leading-none text-muted-foreground" aria-label={`После фильтров: ${current}`}>
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
  return <span className="absolute -right-1 -top-1 inline-flex min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none text-primary-foreground">{value}</span>;
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
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center", className)}>
      <span className="relative inline-flex size-6 items-center justify-center text-muted-foreground" aria-label={label}>
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
  activeSegments: SegmentKey[];
  activeChannel: string | null;
  archivedOnly: boolean;
  searchQuery: string;
  searchInput: string;
  legacyFilters: LegacyFiltersState;
  isListPending: boolean;
  mobileFiltersOpen: boolean;
  sort: ClientListSort;
  sortDirection: ClientListSortDirection;
  onSortSelect: (sort: ClientListSort) => void;
  onSegmentToggle: (key: SegmentKey) => void;
  onChannelChange: (channel: string | null, archived: boolean) => void;
  onClearSearch: () => void;
  onSearchInput: (value: string) => void;
  onMobileFiltersOpenChange: (open: boolean) => void;
};

function PatientsContent({
  listPromise,
  metricsPromise,
  patientPluralLabel,
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
  onSortSelect,
  onSegmentToggle,
  onChannelChange,
  onClearSearch,
  onSearchInput,
  onMobileFiltersOpenChange,
}: PatientsContentProps) {
  const allClients = use(listPromise);
  const metrics = use(metricsPromise);
  const activeCategory: ClientCategory = "all";

  // Apply category filter first, then segment, channel, and legacy filters.
  let filtered = applyCategoryFilter(allClients, activeCategory);
  filtered = applySegmentFilters(filtered, activeSegments);
  filtered = applyChannelFilter(filtered, activeChannel);
  // Legacy filters (AND-logic)
  if (legacyFilters.cancellations) filtered = filtered.filter((c) => c.cancellationsCount > 0);
  if (legacyFilters.visitedMonth) filtered = filtered.filter((c) => c.visitedThisCalendarMonth === true);
  if (legacyFilters.withoutAppointments) filtered = filtered.filter((c) => !(c.hasAppointmentHistory ?? false) && (c.activeAppointmentsCount ?? 0) === 0);
  if (legacyFilters.memberships) filtered = filtered.filter((c) => c.hasActiveMemberships === true);
  if (legacyFilters.reschedules) filtered = filtered.filter((c) => c.reschedulesCount > 0);

  // PAT-09/10: client-side text search across all name fields
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (c) => c.displayName?.toLowerCase().includes(q) || c.firstName?.toLowerCase().includes(q) || c.lastName?.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q),
    );
  }
  filtered = sortClients(filtered, sort, sortDirection);

  // Context base for segment card counts (PAT-02/06/#540):
  // KPI cards are multi-select filters with AND policy. Each card shows the
  // count for its own segment after all other selected KPI filters are applied,
  // followed by the full total for that segment in the current category.
  const categoryBase = applyCategoryFilter(allClients, activeCategory);
  const filteredBySegments = applySegmentFilters(categoryBase, activeSegments);

  // Determine if any filter is active (for "найдено N" header)
  const isAnyFilterActive =
    activeCategory !== "all" ||
    activeSegments.length > 0 ||
    activeChannel !== null ||
    legacyFilters.cancellations ||
    legacyFilters.visitedMonth ||
    legacyFilters.withoutAppointments ||
    legacyFilters.memberships ||
    legacyFilters.reschedules ||
    !!searchQuery.trim();

  const patientPluralLabelLower = patientPluralLabel.toLocaleLowerCase("ru-RU");

  return (
    <>
      <DoctorPageHeader
        id="doctor-patients-header"
        title={patientPluralLabel}
        tabsClassName="w-full"
        tabs={
          <div className="relative w-full min-w-0">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">
              <Search className="size-3.5" aria-hidden />
            </span>
            <Input
              type="search"
              placeholder={`Поиск: ${patientPluralLabelLower}`}
              value={searchInput}
              onChange={(event) => onSearchInput(event.target.value)}
              className="h-8 pl-8 pr-8 text-sm"
              aria-label={`Поиск: ${patientPluralLabelLower}`}
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
        }
      />
      <CatalogSplitLayout
        desktopColsClassName="lg:grid-cols-2"
        mobileView={mobileFiltersOpen ? "detail" : "list"}
        mobileBackSlot={
          mobileFiltersOpen ? (
            <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={() => onMobileFiltersOpenChange(false)}>
              ← Назад
            </Button>
          ) : null
        }
        className="lg:h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_6rem)]"
        left={
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--doctor-page-block-radius,12px)] border border-border bg-card">
            {/* Sticky header: count + reversible sorting */}
            {/* On mobile the page scrolls naturally; sticky is only needed on lg+ where the section has overflow-hidden and its own scroll context */}
            <div className="lg:sticky lg:top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card px-[var(--doctor-block-padding,18px)] py-2">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {isAnyFilterActive ? (
                  <>
                    найдено {filtered.length} / {categoryBase.length}
                  </>
                ) : activeCategory === "all" ? (
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
              <div
                className="flex w-full min-w-0 flex-wrap items-center gap-1.5 lg:w-auto lg:shrink-0 lg:justify-end"
                aria-label={`Сортировка: ${patientPluralLabelLower}`}
              >
                <span className="text-xs text-muted-foreground">Сортировать</span>
                <Button
                  type="button"
              size="sm"
              variant={sort === "recent_appointments" ? "default" : "outline"}
              className="h-8 gap-1.5 px-2 text-xs"
              aria-pressed={sort === "recent_appointments"}
              aria-label={`Недавние: ${sort === "recent_appointments" && sortDirection === "asc" ? "давние сверху" : "недавние сверху"}`}
                  onClick={() => onSortSelect("recent_appointments")}
                >
                  Недавние
                  {sort === "recent_appointments" ? sortDirection === "desc" ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden /> : null}
                </Button>
                <Button
                  type="button"
              size="sm"
              variant={sort === "fio" ? "default" : "outline"}
              className="h-8 gap-1.5 px-2 text-xs"
              aria-pressed={sort === "fio"}
              aria-label={`По фамилии: ${sort === "fio" && sortDirection === "desc" ? "Я–А" : "А–Я"}`}
                  onClick={() => onSortSelect("fio")}
                >
                  По фамилии
                  {sort === "fio" ? sortDirection === "asc" ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden /> : null}
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2 text-xs lg:hidden" onClick={() => onMobileFiltersOpenChange(true)}>
                  <Filter className="size-3.5" aria-hidden />
                  Фильтры
                </Button>
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">{searchQuery.trim() ? "Нет пациентов по запросу." : "Нет пациентов по заданным фильтрам."}</p>
            ) : (
              <ul id="doctor-patients-list" className={`${doctorDnaFlatListClass} min-h-0 flex-1 overflow-y-auto`}>
                {filtered.map((c, index) => {
                  const futureAppointmentCount = c.activeAppointmentsCount ?? 0;
                  const programOrSupervision = c.isOnSupport === true || c.activeTreatmentProgram;
                  return (
                    <li key={c.userId} id={`doctor-patients-item-${c.userId}`}>
                      <Link
                        id={`doctor-patients-card-${c.userId}`}
                        href={routePaths.doctorPatientCard(c.userId)}
                        className={cn(
                          buttonVariants({ variant: "ghost" }),
                          doctorDnaFlatListRowClass,
                          doctorDnaFlatListClickableClass,
                          "h-auto w-full rounded-none border-0 bg-transparent text-left shadow-none active:bg-muted/80 md:gap-3",
                          index === 0 && "border-t-0",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <span className={cn("block truncate", doctorDnaFlatListPrimaryClass)}>{clientPrimaryName(c)}</span>
                        </div>
                        <div className="grid w-[5.75rem] shrink-0 grid-cols-3 gap-1" aria-label="Статусы клиента">
                          <IconSlot visible={c.hasMemberships === true} label="Есть абонемент">
                            <Ticket className="size-3.5" aria-hidden />
                          </IconSlot>
                          <IconSlot visible={programOrSupervision} label={c.isOnSupport === true ? "Клиент на сопровождении" : "Назначенная программа"}>
                            {c.isOnSupport === true ? <Handshake className="size-3.5" aria-hidden /> : <Dumbbell className="size-3.5" aria-hidden />}
                          </IconSlot>
                          <IconSlot visible={futureAppointmentCount > 0} label={`Будущие записи: ${futureAppointmentCount}`} badge={futureAppointmentCount}>
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
          <CatalogRightPane className="h-full bg-transparent" contentClassName="gap-3 p-0">
            {/* Filter panel */}
            <section className="rounded-[var(--doctor-page-block-radius,12px)] border border-border bg-card p-[var(--doctor-block-padding,18px)]">
              {/* Factual filters in the desktop right panel. */}
              <TooltipProvider delay={450}>
                <DoctorMetricList className="grid-cols-3 gap-1.5 xl:grid-cols-3 2xl:grid-cols-3">
                  {SEGMENTS.map((seg) => {
                    const segmentContextBase =
                      seg.key === "all"
                  ? categoryBase
                  : applySegmentFilters(
                            categoryBase,
                            activeSegments.filter((key) => key !== seg.key),
                          );
                    const currentValue = seg.key === "all" ? filteredBySegments.length : (getSegmentCount(seg.key, metrics, segmentContextBase) ?? "—");
                    const totalValue = seg.key === "all" ? categoryBase.length : getSegmentCount(seg.key, metrics, categoryBase);
                    return (
                      <DoctorStatCard
                        key={seg.key}
                        id={`doctor-patients-segment-${seg.key}`}
                        title={seg.key === "all" ? `Все ${patientPluralLabelLower}` : seg.title}
                        value={renderSegmentMetricValue(currentValue, totalValue)}
                        tooltip={seg.key === "all" ? `Все ${patientPluralLabelLower} этой организации.` : seg.tooltip}
                        selected={seg.key === "all" ? activeSegments.length === 0 && !archivedOnly : activeSegments.includes(seg.key)}
                        onClick={() => onSegmentToggle(seg.key)}
                      />
                    );
                  })}
                </DoctorMetricList>
              </TooltipProvider>

              {/* Communication channels */}
              <div className="mt-3 border-t border-border/60 pt-3">
            <p className="mb-2 text-xs text-muted-foreground">Каналы связи</p>
            <div id="doctor-patients-filters" className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={activeChannel === "telegram" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onChannelChange(activeChannel === "telegram" ? null : "telegram", false)}
                aria-pressed={activeChannel === "telegram"}
              >
                Telegram
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChannel === "max" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onChannelChange(activeChannel === "max" ? null : "max", false)}
                aria-pressed={activeChannel === "max"}
              >
                MAX
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChannel === "email" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onChannelChange(activeChannel === "email" ? null : "email", false)}
                aria-pressed={activeChannel === "email"}
              >
                Email
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChannel === "phone" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onChannelChange(activeChannel === "phone" ? null : "phone", false)}
                aria-pressed={activeChannel === "phone"}
              >
                Телефон
              </Button>
              <Button
                type="button"
                size="sm"
                variant={activeChannel === "web_push" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onChannelChange(activeChannel === "web_push" ? null : "web_push", false)}
                aria-pressed={activeChannel === "web_push"}
              >
                <Bell className="mr-1 size-3.5" aria-hidden />
                Пуш-уведомления
              </Button>
                </div>
              </div>
            </section>
          </CatalogRightPane>
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Root component — manages state + debounced search
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 200;

export function PatientsPageClient({ listPromise: initialListPromise, metricsPromise, initialFilters, patientPluralLabel = "Пациенты" }: PatientsPageClientProps) {
  const isListPending = false;

  // Search state (local, debounced)
  const [searchInput, setSearchInput] = useState(initialFilters.q);
  const [searchQuery, setSearchQuery] = useState(initialFilters.q);
  const [listPromise, setListPromise] = useState<Promise<ClientListItem[]>>(initialListPromise);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Segment / channel / archive state (segment and channel are client-side only)
  const [activeSegments, setActiveSegments] = useState<SegmentKey[]>(() => segmentKeyFromUrl(initialFilters.segment));
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [archivedOnly, setArchivedOnly] = useState(initialFilters.archivedOnly);

  // Legacy per-button filter state (client-side only)
  const [legacyFilters] = useState<LegacyFiltersState>(DEFAULT_LEGACY_FILTERS);

  // Category mechanism remains dormant/reversible; this page defaults to all organization people.
  const [sort, setSort] = useState<ClientListSort>("recent_appointments");
  const [sortDirection, setSortDirection] = useState<ClientListSortDirection>("desc");

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("channel")) return;
    url.searchParams.delete("channel");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const handleSegmentToggle = useCallback((key: SegmentKey) => {
    // Segment filters are client-side only and combine via AND.
    setActiveSegments((prev) => {
      if (key === "all") return [];
      return prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key];
    });
  }, []);

  const handleChannelChange = useCallback((channel: string | null, archived: boolean) => {
    setActiveChannel(channel);
    setArchivedOnly(archived);
  }, []);

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
    setSearchInput("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchQuery("");
    // PAT-10: no fetchList call — client-side filtering resets automatically
  }, []);

  // Keep state in sync when server-side navigation occurs (Next.js router)
  useEffect(() => {
    setListPromise(initialListPromise);
    setSearchInput(initialFilters.q);
    setActiveSegments(segmentKeyFromUrl(initialFilters.segment));
    setActiveChannel(null);
    setArchivedOnly(initialFilters.archivedOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialListPromise]);

  const handleSortSelect = useCallback(
    (nextSort: ClientListSort) => {
      if (nextSort === sort) {
        setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
        return;
      }
      setSort(nextSort);
      setSortDirection(nextSort === "recent_appointments" ? "desc" : "asc");
    },
    [sort],
  );

  return (
    <Suspense fallback={<PatientListSkeleton />}>
      <PatientsContent
        listPromise={listPromise}
        metricsPromise={metricsPromise}
        patientPluralLabel={patientPluralLabel}
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
        onSortSelect={handleSortSelect}
        onSegmentToggle={handleSegmentToggle}
        onChannelChange={handleChannelChange}
        onClearSearch={clearSearch}
        onSearchInput={handleSearchInput}
        onMobileFiltersOpenChange={setMobileFiltersOpen}
      />
    </Suspense>
  );
}
