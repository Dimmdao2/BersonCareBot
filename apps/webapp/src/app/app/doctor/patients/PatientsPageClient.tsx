"use client";

/**
 * PatientsPageClient — unified patients list.
 *
 * Layout (desktop, 2-column):
 *   LEFT  – patient list with search on top
 *   RIGHT – filter panel (segment stat cards + channel row + additional filters)
 *           + PatientPreviewPane when a row is selected
 *
 * Search logic: debounced API call (/api/doctor/patients?q=…), min 3 chars.
 */

import { Suspense, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Search, X, Bell, CalendarDays, Dumbbell, ExternalLink, Handshake, Mail, MessageSquare, Phone, Send, Smartphone, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { ClientListItem, DoctorDashboardPatientMetrics, PatientCardHeader } from "@/modules/doctor-clients/ports";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "@/app/app/doctor/analytics/clients/DoctorStatCard";
import { Button, buttonVariants } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { doctorListItemOuterClass, doctorSectionCardClass } from "@/shared/ui/doctor/doctorVisual";
import { doctorClientListRowLinkClass } from "@/app/app/doctor/clients/doctorClientCardChrome";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { formatFioForDoctor } from "@/lib/parseFullName";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { DoctorOpenChatButton } from "@/shared/ui/doctor/DoctorOpenChatButton";
import { patientCardHref } from "./patientCardHref";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Категория клиента — грубая классификация по вовлечённости.
 *
 *  - `client`          — есть записи/визиты, активное сопровождение или программа
 *  - `subscriber_only` — зарегистрирован, но ничего из вышеперечисленного
 *  - `all`             — все пациенты (нет фильтра по категории)
 *
 * Категория «потенциальный» (есть чат, нет записей) не может быть определена
 * только по флагам списка, поэтому используем «подписчик» как самую широкую
 * незадействованную категорию.
 */
export type ClientCategory = "all" | "client" | "subscriber_only";

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
  | "new"
  | "former"
  | "cancellations"
  | "memberships"
  | "visited_month";

type SegmentDef = {
  key: SegmentKey;
  title: string;
  /** URL param value (null = no filter / "Все") */
  urlValue: string | null;
};

const SEGMENTS: SegmentDef[] = [
  { key: "all",                  title: "Все",                  urlValue: null },
  { key: "appointments",         title: "С записями",           urlValue: "appointments" },
  { key: "on_support",           title: "На сопровождении",     urlValue: "on_support" },
  { key: "with_program",         title: "С программой",         urlValue: "with_program" },
  { key: "without_appointments", title: "Без приёмов",          urlValue: "without_appointments" },
  { key: "new",                  title: "Новые",                urlValue: "new" },
  { key: "former",               title: "Бывшие",               urlValue: "former" },
  { key: "cancellations",        title: "С отменами",           urlValue: "cancellations" },
  { key: "memberships",          title: "С абонементами",       urlValue: "memberships" },
  { key: "visited_month",        title: "Приём в этом мес.",    urlValue: "visited_month" },
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
    case "new":
      return (item.activeAppointmentsCount ?? 0) > 0 && !(item.hasAppointmentHistory ?? false);
    case "former":
      return (item.hasAppointmentHistory ?? false) && (item.activeAppointmentsCount ?? 0) === 0;
    case "cancellations":
      return item.cancellationCount30d > 0;
    case "memberships":
      return item.hasMemberships === true;
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
function getClientCategory(item: ClientListItem): Exclude<ClientCategory, "all"> {
  const isClient =
    item.isOnSupport === true ||
    item.activeTreatmentProgram === true ||
    (item.hasAppointmentHistory ?? false) ||
    (item.activeAppointmentsCount ?? 0) > 0;
  return isClient ? "client" : "subscriber_only";
}

function applyCategoryFilter(list: ClientListItem[], category: ClientCategory): ClientListItem[] {
  if (category === "all") return list;
  return list.filter((item) => getClientCategory(item) === category);
}

// ---------------------------------------------------------------------------
// Segment count helper (computed from allClients using clientSegmentPredicate)
// ---------------------------------------------------------------------------

function getSegmentCount(
  key: SegmentKey,
  _metrics: DoctorDashboardPatientMetrics,
  clients: ClientListItem[],
): number | null {
  if (key === "all") return clients.length;
  return clients.filter((item) => clientSegmentPredicate(item, key)).length;
}

function renderSegmentMetricValue(current: number | string, total: number | null): ReactNode {
  if (typeof current !== "number" || total === null || current === total) return current;

  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span>{current}</span>
      <span className="text-sm font-medium text-muted-foreground/50">/</span>
      <span className="text-base font-semibold tabular-nums leading-none text-muted-foreground">{total}</span>
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
  title: string;
  badge?: number;
  className?: string;
  children: ReactNode;
};

function IconSlot({ visible, label, title, badge, className, children }: IconSlotProps) {
  if (!visible) {
    return null;
  }
  return (
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center", className)}>
      <span
        className="relative inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground"
        aria-label={label}
        title={title}
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
    <div className="grid gap-3 lg:min-h-0 lg:grid-cols-[1.4fr_1fr] lg:items-start">
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
// PatientPreviewPane — inline summary shown when a list row is selected
// ---------------------------------------------------------------------------

/** Format ISO date string → DD.MM.YYYY */
function fmtDate(iso: string | null | undefined, tz = "Europe/Moscow"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Format ISO date+time → DD.MM.YYYY HH:MM */
function fmtDateTime(date: string | null | undefined, time?: string | null, tz = "Europe/Moscow"): string {
  if (!date) return "—";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "—";
  const dateStr = d.toLocaleDateString("ru-RU", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" });
  return time ? `${dateStr} ${time}` : dateStr;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // silent
  }
}

type PreviewProgramSummary = {
  id: string;
  title: string;
  status: string;
};

type PreviewProgramListResponse = {
  ok: boolean;
  items?: PreviewProgramSummary[];
};

type ChannelActionButtonProps = {
  label: string;
  title: string;
  active: boolean;
  href?: string | null;
  onClick?: () => void;
  children: ReactNode;
};

function channelActionClass(active: boolean): string {
  return cn(
    buttonVariants({ variant: active ? "outline" : "secondary", size: "sm" }),
    channelActionExtraClass(active),
  );
}

function channelActionExtraClass(active: boolean): string {
  return cn(
    "h-10 justify-center px-2 text-xs sm:h-8",
    active
      ? "border-primary/35 bg-primary/5 text-primary hover:bg-primary/15"
      : "pointer-events-none border-border/50 bg-muted/30 text-muted-foreground/50",
  );
}

function ChannelActionButton({ label, title, active, href, onClick, children }: ChannelActionButtonProps) {
  if (active && href) {
    return (
      <a href={href} className={channelActionClass(true)} title={title} aria-label={label}>
        {children}
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={channelActionClass(active)}
      title={title}
      aria-label={label}
      disabled={!active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

type PatientPreviewPaneProps = {
  userId: string;
  item: ClientListItem;
  onClose: () => void;
  displayIana?: string;
};

function PatientPreviewPane({ userId, item, onClose, displayIana = "Europe/Moscow" }: PatientPreviewPaneProps) {
  const [header, setHeader] = useState<PatientCardHeader | null>(null);
  const [activeProgram, setActiveProgram] = useState<PreviewProgramSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setHeader(null);
    setActiveProgram(null);
    const headerRequest = fetch(`/api/doctor/patients/${encodeURIComponent(userId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ ok: boolean; header?: PatientCardHeader }>;
      });
    const programRequest = item.activeTreatmentProgram
      ? fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`, { credentials: "include" })
          .then((r) => (r.ok ? (r.json() as Promise<PreviewProgramListResponse>) : null))
          .catch(() => null)
      : Promise.resolve(null);

    Promise.all([headerRequest, programRequest])
      .then(([headerData, programData]) => {
        if (!cancelled) {
          if (headerData.ok && headerData.header) {
            setHeader(headerData.header);
          } else {
            setError(true);
          }
          const active = (programData?.items ?? []).find((program) => program.status === "active") ?? null;
          setActiveProgram(active);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [item.activeTreatmentProgram, userId]);

  const hasTelegram = Boolean(item.bindings.telegramId?.trim()) && !item.bindings.telegramBotBlocked;
  const hasMax = Boolean(item.bindings.maxId?.trim()) && !item.bindings.maxBotBlocked;
  const hasEmail = item.hasEmail === true;
  const hasChat = item.hasApp === true || item.hasConversation === true || hasTelegram || hasMax;
  const cardHref = routePaths.doctorPatientCard(userId);
  const commsHref = patientCardHref(userId, { tab: "comms" });
  const telHref = phoneToTelHref(item.phone);
  const email = header?.identity.email?.trim() ?? null;
  const telegramId = item.bindings.telegramId?.trim() ?? "";
  const maxId = item.bindings.maxId?.trim() ?? "";

  const copyChannelValue = (label: string, value: string) => {
    void copyToClipboard(value);
    setCopiedLabel(label);
    window.setTimeout(() => setCopiedLabel((current) => (current === label ? null : current)), 1400);
  };

  return (
    <div className={cn(doctorSectionCardClass, "flex flex-col gap-2 p-3")}>
      {/* Header row: name + close button */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {(item.lastName ?? item.firstName) ? (
            <>
              <span className="block truncate text-sm font-bold text-foreground">
                {formatFioForDoctor(item.lastName, item.firstName, item.patronymic)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{item.displayName}</span>
            </>
          ) : (
            <span className="block truncate text-sm font-bold text-foreground">{item.displayName}</span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          aria-label="Закрыть"
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* Fast actions */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <DoctorOpenChatButton
          patientUserId={userId}
          patientName={item.displayName}
          variant="outline"
          size="sm"
          disabled={!hasChat}
          title={hasChat ? "Открыть чат" : "Нет доступного канала для чата"}
          className={channelActionExtraClass(hasChat)}
        >
          <MessageSquare className="mr-1 size-3.5" aria-hidden />
          Чат
        </DoctorOpenChatButton>
        <ChannelActionButton label="Позвонить" title={item.phone ?? "Телефон не указан"} active={telHref !== null} href={telHref}>
          <Phone className="mr-1 size-3.5" aria-hidden />
          Звонок
        </ChannelActionButton>
        <ChannelActionButton label="Написать email" title={email ?? "Email не указан"} active={hasEmail && email !== null} href={email ? `mailto:${email}` : null}>
          <Mail className="mr-1 size-3.5" aria-hidden />
          Email
        </ChannelActionButton>
        <Link href={cardHref} className={cn(buttonVariants({ size: "sm" }), "h-8 justify-center px-2 text-xs")}>
          <ExternalLink className="mr-1 size-3.5" aria-hidden />
          Карта
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <ChannelActionButton
          label="Скопировать Telegram ID"
          title={hasTelegram ? `Скопировать Telegram ID ${telegramId}` : "Telegram не привязан"}
          active={hasTelegram}
          onClick={() => copyChannelValue("Telegram", telegramId)}
        >
          <Send className="mr-1 size-3.5" aria-hidden />
          {copiedLabel === "Telegram" ? "Скопировано" : "Telegram"}
        </ChannelActionButton>
        <ChannelActionButton
          label="Скопировать MAX ID"
          title={hasMax ? `Скопировать MAX ID ${maxId}` : "MAX не привязан"}
          active={hasMax}
          onClick={() => copyChannelValue("MAX", maxId)}
        >
          <Smartphone className="mr-1 size-3.5" aria-hidden />
          {copiedLabel === "MAX" ? "Скопировано" : "MAX"}
        </ChannelActionButton>
        <ChannelActionButton
          label="Скопировать телефон"
          title={item.phone ? `Скопировать ${item.phone}` : "Телефон не указан"}
          active={Boolean(item.phone?.trim())}
          onClick={() => item.phone && copyChannelValue("Телефон", item.phone)}
        >
          <Phone className="mr-1 size-3.5" aria-hidden />
          {copiedLabel === "Телефон" ? "Скопировано" : "Копия тел."}
        </ChannelActionButton>
        <Link href={commsHref} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-10 justify-center px-2 text-xs sm:h-8")}>
          <MessageSquare className="mr-1 size-3.5" aria-hidden />
          Вкладка
        </Link>
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-1">
        {item.hasApp ? (
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Приложение
          </span>
        ) : null}
        {item.hasWebPush ? (
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Пуши включены
          </span>
        ) : null}
        {item.isOnSupport ? (
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            ★ На сопровождении
          </span>
        ) : null}
        {item.activeTreatmentProgram ? (
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {activeProgram?.title ?? "С программой"}
          </span>
        ) : null}
        {item.hasMemberships ? (
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Абонемент
          </span>
        ) : null}
        {(item.unreadMessagesCount ?? 0) > 0 ? (
          <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            Непрочитанных: {item.unreadMessagesCount}
          </span>
        ) : null}
      </div>

      {/* Stats row — lazy loaded */}
      {loading ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted/50" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted/50" />
        </div>
      ) : error ? (
        <p className="text-xs text-muted-foreground">Не удалось загрузить детали.</p>
      ) : header ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex gap-1">
            <span className="font-medium text-foreground">Прошлый визит:</span>
            <span>{fmtDate(header.lastVisit?.date, displayIana)}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-medium text-foreground">Следующая запись:</span>
            <span>{fmtDateTime(header.nextAppointment?.date, header.nextAppointment?.time, displayIana)}</span>
          </div>
          <div className="flex gap-1">
            <span className="font-medium text-foreground">Визитов:</span>
            <span>{header.totalVisits}</span>
          </div>
        </div>
      ) : null}

      {/* CTA */}
      <div className="mt-1 border-t border-border/40 pt-2">
        <Link
          href={cardHref}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Открыть карту <ExternalLink className="size-3" />
        </Link>
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
  selectedUserId: string | null;
  activeCategory: ClientCategory;
  displayIana?: string;
  onCategoryChange: (category: ClientCategory) => void;
  onSegmentToggle: (key: SegmentKey) => void;
  onChannelChange: (channel: string | null, archived: boolean) => void;
  onClearSearch: () => void;
  onSearchInput: (value: string) => void;
  onSelectPatient: (userId: string | null) => void;
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
  selectedUserId,
  activeCategory,
  displayIana,
  onCategoryChange,
  onSegmentToggle,
  onChannelChange,
  onClearSearch,
  onSearchInput,
  onSelectPatient,
}: PatientsContentProps) {
  const allClients = use(listPromise);
  const metrics = use(metricsPromise);

  // Apply category filter first, then segment, channel, and legacy filters.
  let filtered = applyCategoryFilter(allClients, activeCategory);
  filtered = applySegmentFilters(filtered, activeSegments);
  filtered = applyChannelFilter(filtered, activeChannel);
  // Legacy filters (AND-logic)
  if (legacyFilters.cancellations) filtered = filtered.filter((c) => c.cancellationCount30d > 0);
  if (legacyFilters.visitedMonth) filtered = filtered.filter((c) => c.visitedThisCalendarMonth === true);
  if (legacyFilters.withoutAppointments) filtered = filtered.filter(
    (c) => !(c.hasAppointmentHistory ?? false) && (c.activeAppointmentsCount ?? 0) === 0,
  );
  if (legacyFilters.memberships) filtered = filtered.filter((c) => c.hasMemberships === true);
  if (legacyFilters.reschedules) filtered = filtered.filter((c) => (c.rescheduleCount30d ?? 0) > 0);

  // PAT-09/10: client-side text search across all name fields
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.displayName?.toLowerCase().includes(q) ||
        c.firstName?.toLowerCase().includes(q) ||
        c.lastName?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q),
    );
  }

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

  // Segment tone: highlight active segment card
  function segmentTone(key: SegmentKey): "neutral" | "warning" {
    const isActive =
      (key === "all" && activeSegments.length === 0 && !archivedOnly) ||
      activeSegments.includes(key);
    return isActive ? "warning" : "neutral";
  }

  const selectedItem = selectedUserId ? filtered.find((c) => c.userId === selectedUserId) ?? null : null;

  return (
    <>
    <DoctorPageHeader
      id="doctor-patients-header"
      title={patientPluralLabel}
    />
    <div className="grid min-w-0 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      {/* ===== LEFT: patient list ===== */}
      <section
        className={cn(
          "flex flex-col rounded-lg border border-border bg-card",
          "lg:min-h-0 lg:h-[calc(100dvh_-_var(--doctor-sticky-offset,calc(3.5rem_+_env(safe-area-inset-top,0px)))_-_6rem)] lg:overflow-hidden",
        )}
      >
        {/* Search — above sticky header, non-sticky */}
        <div className="shrink-0 px-2 pt-2">
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Поиск…"
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
              className="pl-8 pr-8 text-sm"
              aria-label="Поиск пациентов"
            />
            {searchInput && (
              <Button
                type="button"
                variant="ghost"
                onClick={onClearSearch}
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Сбросить поиск"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Sticky header: count */}
        {/* On mobile the page scrolls naturally; sticky is only needed on lg+ where the section has overflow-hidden and its own scroll context */}
        <div className="lg:sticky lg:top-0 z-10 shrink-0 border-b border-border/60 bg-card px-2 py-2 md:px-5">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {isAnyFilterActive
              ? <>найдено {filtered.length} / {categoryBase.length}</>
              : activeCategory === "all"
                ? <>Клиентов: {allClients.length}</>
                : <>Пациентов: {categoryBase.length}</>}
            {isListPending && <span className="ml-1 animate-pulse">…</span>}
          </p>
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            {searchQuery.trim()
              ? "Нет пациентов по запросу."
              : "Нет пациентов по заданным фильтрам."}
          </p>
        ) : (
          <ul id="doctor-patients-list" className="m-0 list-none space-y-1.5 p-2 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
            {filtered.map((c) => {
              const futureAppointmentCount = c.activeAppointmentsCount ?? 0;
              const isSelected = c.userId === selectedUserId;
              return (
                <li key={c.userId} id={`doctor-patients-item-${c.userId}`} className={doctorListItemOuterClass}>
                  <Button
                    type="button"
                    variant="ghost"
                    id={`doctor-patients-card-${c.userId}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelectPatient(isSelected ? null : c.userId)}
                    className={cn(
                      doctorClientListRowLinkClass,
                      "w-full items-center gap-2 px-2 text-left md:gap-3 md:px-3",
                      isSelected && "bg-primary/15 hover:bg-primary/15",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      {(c.lastName ?? c.firstName) ? (
                        <>
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {formatFioForDoctor(c.lastName, c.firstName, c.patronymic)}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">{c.displayName}</span>
                        </>
                      ) : (
                        <span className="block truncate text-sm font-semibold text-foreground">{c.displayName}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconSlot
                        visible={futureAppointmentCount > 0}
                        label={`Будущие записи: ${futureAppointmentCount}`}
                        title="Будущие записи"
                        badge={futureAppointmentCount}
                      >
                        <CalendarDays className="size-3.5" aria-hidden />
                      </IconSlot>
                      <IconSlot
                        visible={c.activeTreatmentProgram && c.isOnSupport !== true}
                        label="Назначенная программа"
                        title="Назначенная программа"
                      >
                        <Dumbbell className="size-3.5" aria-hidden />
                      </IconSlot>
                      <IconSlot
                        visible={c.isOnSupport === true}
                        label="Клиент на сопровождении"
                        title="На сопровождении"
                      >
                        <Handshake className="size-3.5" aria-hidden />
                      </IconSlot>
                      <IconSlot
                        visible={c.hasMemberships === true}
                        label="Есть абонемент"
                        title="Есть абонемент"
                      >
                        <Ticket className="size-3.5" aria-hidden />
                      </IconSlot>
                    </div>
                  </Button>
                  {isSelected ? (
                    <div className="mt-1 lg:hidden">
                      <PatientPreviewPane
                        userId={c.userId}
                        item={c}
                        onClose={() => onSelectPatient(null)}
                        displayIana={displayIana}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ===== RIGHT: filter panel + desktop preview pane ===== */}
      <div className="order-first flex flex-col gap-3 lg:order-none lg:min-h-0">
        {/* Filter panel */}
        <section
          className={cn(
            "rounded-lg border border-border bg-card p-3",
          )}
        >
          <div className="border-b border-border/60 pb-3">
            <p className="mb-2 text-xs text-muted-foreground">Категория клиентов</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Категория клиентов">
              {(
                [
                  ["client", "Клиенты"],
                  ["subscriber_only", "Подписчики"],
                  ["all", "Все"],
                ] as const
              ).map(([category, label]) => (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={activeCategory === category ? "default" : "outline"}
                  className="h-7 px-2 text-xs"
                  onClick={() => onCategoryChange(category)}
                  aria-pressed={activeCategory === category}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Segment stat cards — 3 per row on mobile, 5 on lg+ */}
          <DoctorMetricList className="mt-3 grid-cols-3 gap-1.5 lg:grid-cols-5 xl:grid-cols-5">
            {SEGMENTS.map((seg) => {
              const segmentContextBase =
                seg.key === "all"
                  ? categoryBase
                  : applySegmentFilters(
                      categoryBase,
                      activeSegments.filter((key) => key !== seg.key),
                    );
              const currentValue =
                seg.key === "all"
                  ? filteredBySegments.length
                  : (getSegmentCount(seg.key, metrics, segmentContextBase) ?? "—");
              const totalValue = seg.key === "all" ? categoryBase.length : getSegmentCount(seg.key, metrics, categoryBase);
              return (
                <DoctorStatCard
                  key={seg.key}
                  id={`doctor-patients-segment-${seg.key}`}
                  title={seg.title}
                  value={renderSegmentMetricValue(currentValue, totalValue)}
                  tone={segmentTone(seg.key)}
                  onClick={() => onSegmentToggle(seg.key)}
                />
              );
            })}
          </DoctorMetricList>

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

        {/* Preview pane — shown when a row is selected */}
        {selectedUserId && selectedItem ? (
          <div className="hidden lg:block">
            <PatientPreviewPane
              userId={selectedUserId}
              item={selectedItem}
              onClose={() => onSelectPatient(null)}
              displayIana={displayIana}
            />
          </div>
        ) : null}
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root component — manages state + debounced search
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 200;

export function PatientsPageClient({
  listPromise: initialListPromise,
  metricsPromise,
  initialFilters,
  patientPluralLabel = "Пациенты",
  displayIana,
}: PatientsPageClientProps) {
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

  // Category filter state (client-side only, S4.2)
  const [activeCategory, setActiveCategory] = useState<ClientCategory>("client");

  // Selected patient for preview
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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

  const handleChannelChange = useCallback(
    (channel: string | null, archived: boolean) => {
      setActiveChannel(channel);
      setArchivedOnly(archived);
    },
    [],
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = value.trim();
      // PAT-10: debounce only — no API call, filtering is purely client-side
      debounceRef.current = setTimeout(() => {
        setSearchQuery(trimmed);
      }, SEARCH_DEBOUNCE_MS);
    },
    [],
  );

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

  const handleSelectPatient = useCallback((userId: string | null) => {
    setSelectedUserId(userId);
  }, []);

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
        selectedUserId={selectedUserId}
        activeCategory={activeCategory}
        displayIana={displayIana}
        onCategoryChange={setActiveCategory}
        onSegmentToggle={handleSegmentToggle}
        onChannelChange={handleChannelChange}
        onClearSearch={clearSearch}
        onSearchInput={handleSearchInput}
        onSelectPatient={handleSelectPatient}
      />
    </Suspense>
  );
}
