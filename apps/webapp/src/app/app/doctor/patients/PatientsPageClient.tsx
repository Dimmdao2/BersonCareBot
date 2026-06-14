"use client";

/**
 * PatientsPageClient — Wave 2: full UI.
 * Design etalon: docs/design/doctor-cabinet-wireframe.html #p-patients
 * Pattern: mirrors exercises/ExercisesPageClient.tsx (use(), CatalogSplitLayout, DoctorCatalogFiltersToolbar)
 */

import { Suspense, use, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { routePaths } from "@/app-layer/routes/paths";
import type { ClientListItem, DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";
import {
  doctorCatalogRowClass,
  doctorCatalogRowActiveClass,
  doctorCatalogListEmptyClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import {
  DoctorCatalogFiltersToolbar,
  DoctorCatalogToolbarFiltersSlot,
} from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { CatalogLeftPane } from "@/shared/ui/doctor/catalog/CatalogLeftPane";
import { CatalogRightPane } from "@/shared/ui/doctor/catalog/CatalogRightPane";
import { DoctorCatalogPageLayout } from "@/shared/ui/doctor/catalog/DoctorCatalogPageLayout";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from "@/shared/ui/doctor/doctorWorkspaceLayout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InitialFilters = {
  q: string;
  segment: string | null;
  channel: string | null;
  archivedOnly: boolean;
};

export type PatientsPageClientProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  initialFilters: InitialFilters;
};

// ---------------------------------------------------------------------------
// Segment definitions (owner answer #5, wireframe terminology)
// ---------------------------------------------------------------------------

type SegmentKey =
  | "all"
  | "on_support"
  | "with_program"
  | "visited_month"
  | "memberships"
  | "subscriber"
  | "new"
  | "former"
  | "cancellations";

type SegmentDef = {
  key: SegmentKey;
  label: string;
  /** Segment value sent as URL param (null = Все/reset) */
  value: string | null;
};

const SEGMENTS: SegmentDef[] = [
  { key: "all", label: "Все · сброс", value: null },
  { key: "on_support", label: "На сопровождении", value: "on_support" },
  { key: "with_program", label: "С программой", value: "with_program" },
  { key: "visited_month", label: "Приём в этом мес.", value: "visited_month" },
  { key: "memberships", label: "С абонементами", value: "memberships" },
  { key: "subscriber", label: "Подписчики", value: "subscriber" },
  { key: "new", label: "Новые", value: "new" },
  { key: "former", label: "Бывшие", value: "former" },
  { key: "cancellations", label: "С отменами", value: "cancellations" },
];

type ChannelKey = "telegram" | "max" | "email" | "phone" | "archive";
type ChannelDef = { key: ChannelKey; label: string };

const CHANNELS: ChannelDef[] = [
  { key: "telegram", label: "Telegram" },
  { key: "max", label: "MAX" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Телефон" },
  { key: "archive", label: "Архив" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildPatientListUrl(filters: {
  q?: string;
  segment?: string | null;
  channel?: string | null;
  archivedOnly?: boolean;
}): string {
  const sp = new URLSearchParams();
  if (filters.q?.trim()) sp.set("q", filters.q.trim());
  if (filters.segment) sp.set("segment", filters.segment);
  if (filters.channel) sp.set("channel", filters.channel);
  if (filters.archivedOnly) sp.set("archived", "true");
  const qs = sp.toString();
  return qs ? `${routePaths.doctorPatients}?${qs}` : routePaths.doctorPatients;
}

function hiddenName(client: ClientListItem): string | null {
  const parts = [client.firstName, client.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  return phone;
}

// ---------------------------------------------------------------------------
// Segment count mapping from metrics
// ---------------------------------------------------------------------------

function getSegmentCount(
  seg: SegmentKey,
  metrics: DoctorDashboardPatientMetrics,
  allCount: number,
): number | null {
  switch (seg) {
    case "all": return allCount;
    case "on_support": return metrics.onSupportCount;
    case "visited_month": return metrics.visitedThisCalendarMonthCount;
    case "with_program": return metrics.withProgramCount;
    case "memberships": return metrics.membershipsCount;
    case "subscriber": return metrics.subscriberCount;
    case "new": return metrics.newCount;
    case "former": return metrics.formerCount;
    case "cancellations": return metrics.cancellationsCount;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Segment cards
// ---------------------------------------------------------------------------

type SegmentCardsProps = {
  metrics: DoctorDashboardPatientMetrics;
  allCount: number;
  activeSegment: string | null;
  onSegmentChange: (value: string | null) => void;
};

function SegmentCards({ metrics, allCount, activeSegment, onSegmentChange }: SegmentCardsProps) {
  // Row 1: 4 cards (Все, На сопровождении, С программой, Приём в этом мес.)
  const row1 = SEGMENTS.slice(0, 4);
  // Row 2: 5 cards (С абонементами, Подписчики, Новые, Бывшие, С отменами)
  const row2 = SEGMENTS.slice(4);

  function renderCard(seg: SegmentDef) {
    const count = getSegmentCount(seg.key, metrics, allCount);
    const isActive = seg.value === activeSegment || (seg.key === "all" && activeSegment === null);
    return (
      <button
        key={seg.key}
        type="button"
        onClick={() => onSegmentChange(seg.value)}
        className={cn(
          "flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-left transition-colors",
          isActive
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-background hover:border-primary/30 hover:bg-primary/5",
        )}
      >
        <span
          className={cn(
            "text-[9.5px] font-medium uppercase tracking-wide leading-snug line-clamp-2",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        >
          {seg.label}
        </span>
        {count !== null ? (
          <span className={cn("text-sm font-bold tabular-nums leading-tight", isActive ? "text-primary" : "text-foreground")}>
            {count}
          </span>
        ) : (
          <span className="text-sm font-bold text-muted-foreground/40">—</span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-4 gap-1">{row1.map(renderCard)}</div>
      <div className="grid grid-cols-5 gap-1">{row2.map(renderCard)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel row
// ---------------------------------------------------------------------------

type ChannelRowProps = {
  activeChannel: string | null;
  archivedOnly: boolean;
  onChannelChange: (channel: string | null, archived: boolean) => void;
};

function ChannelRow({ activeChannel, archivedOnly, onChannelChange }: ChannelRowProps) {
  return (
    <div className="mt-2 border-t border-dashed border-border pt-2">
      <p className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        Канал связи · архив
      </p>
      <div className="flex flex-wrap gap-1">
        {CHANNELS.map((ch) => {
          const isArchive = ch.key === "archive";
          const isActive = isArchive ? archivedOnly : activeChannel === ch.key;
          return (
            <button
              key={ch.key}
              type="button"
              onClick={() => {
                if (isArchive) {
                  onChannelChange(null, !archivedOnly);
                } else {
                  onChannelChange(isActive ? null : ch.key, false);
                }
              }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/5",
              )}
            >
              {ch.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient row
// ---------------------------------------------------------------------------

type PatientRowProps = {
  client: ClientListItem;
  isActive: boolean;
  onSelect: (userId: string) => void;
};

function PatientRow({ client, isActive, onSelect }: PatientRowProps) {
  const hidden = hiddenName(client);
  return (
    <button
      type="button"
      onClick={() => onSelect(client.userId)}
      className={cn(
        doctorCatalogRowClass,
        "flex-col items-start gap-0.5 py-2",
        isActive && doctorCatalogRowActiveClass,
      )}
    >
      <span className="text-sm font-medium leading-tight truncate w-full">{client.displayName}</span>
      {hidden && (
        <span className={cn("text-xs leading-tight truncate w-full", isActive ? "text-primary/70" : "text-muted-foreground")}>
          {hidden}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Patient preview (right panel)
// ---------------------------------------------------------------------------

type PatientPreviewProps = {
  client: ClientListItem | null;
};

function PatientPreview({ client }: PatientPreviewProps) {
  if (!client) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Выберите пациента для просмотра</p>
      </div>
    );
  }

  const hidden = hiddenName(client);
  const phone = formatPhone(client.phone);

  const copyPhone = () => {
    if (client.phone) {
      navigator.clipboard.writeText(client.phone).catch(() => undefined);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-1 py-1">
      {/* Name */}
      <div>
        <p className="text-base font-semibold leading-tight text-foreground">{client.displayName}</p>
        {hidden && (
          <p className="mt-0.5 text-xs text-muted-foreground">{hidden}</p>
        )}
      </div>

      {/* Contacts */}
      <div className="flex flex-col gap-1">
        {phone && (
          <button
            type="button"
            onClick={copyPhone}
            title="Скопировать телефон"
            className="flex items-center gap-1.5 text-sm text-left group"
          >
            <span className="text-muted-foreground">📞</span>
            <span className="group-hover:underline underline-offset-2">{phone}</span>
          </button>
        )}
        {client.hasEmail && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">✉</span>
            <span className="text-foreground">Email</span>
          </div>
        )}
        {client.bindings.telegramId && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">TG</span>
            <span className="text-foreground">{client.bindings.telegramId}</span>
          </div>
        )}
        {client.bindings.maxId && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">MAX</span>
            <span className="text-foreground">{client.bindings.maxId}</span>
          </div>
        )}
        {!phone && !client.hasEmail && !client.bindings.telegramId && !client.bindings.maxId && (
          <p className="text-xs text-muted-foreground">Контакты не указаны</p>
        )}
      </div>

      {/* Program */}
      {client.activeTreatmentProgram && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5">
          <p className="text-xs text-muted-foreground">Программа</p>
          <p className="text-sm font-medium text-foreground">Активная программа</p>
        </div>
      )}

      {/* Counters */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(client.activeAppointmentsCount ?? 0) > 0 && (
          <span>Записей: <strong className="text-foreground">{client.activeAppointmentsCount}</strong></span>
        )}
        {(client.cancellationCount30d ?? 0) > 0 && (
          <span>Отмен (30 дн): <strong className="text-foreground">{client.cancellationCount30d}</strong></span>
        )}
        {client.visitedThisCalendarMonth && (
          <span className="text-primary font-medium">Приём в этом мес.</span>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5">
        {client.isOnSupport && (
          <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            На сопровождении
          </span>
        )}
        {client.hasMemberships && (
          <span className="rounded-md border border-border bg-muted/30 px-2 py-0.5 text-xs text-foreground">
            Абонемент
          </span>
        )}
        {(client.unreadMessagesCount ?? 0) > 0 && (
          <span className="rounded-md border border-amber-400/30 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {client.unreadMessagesCount} непрочитанных
          </span>
        )}
      </div>

      {/* CTA */}
      <div className="pt-1">
        <Link
          href={routePaths.doctorPatientCard(client.userId)}
          className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Открыть карточку
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List skeleton
// ---------------------------------------------------------------------------

function PatientListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="hidden gap-3 lg:grid lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 h-4 w-24 animate-pulse rounded bg-muted/50" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="mb-1.5 h-10 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
        <div className="rounded-xl bg-card px-6 py-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-3 lg:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="mb-1.5 h-10 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content component (uses Suspense data)
// ---------------------------------------------------------------------------

type PatientsContentProps = {
  listPromise: Promise<ClientListItem[]>;
  metricsPromise: Promise<DoctorDashboardPatientMetrics>;
  activeSegment: string | null;
  activeChannel: string | null;
  archivedOnly: boolean;
  searchQuery: string;
  selectedUserId: string | null;
  isListPending: boolean;
  onSegmentChange: (value: string | null) => void;
  onChannelChange: (channel: string | null, archived: boolean) => void;
  onSelectClient: (userId: string) => void;
  onMobileBack: () => void;
  mobileView: "list" | "detail";
};

function PatientsContent({
  listPromise,
  metricsPromise,
  activeSegment,
  activeChannel,
  archivedOnly,
  searchQuery,
  selectedUserId,
  isListPending,
  onSegmentChange,
  onChannelChange,
  onSelectClient,
  onMobileBack,
  mobileView,
}: PatientsContentProps) {
  const clients = use(listPromise);
  const metrics = use(metricsPromise);

  const selectedClient = clients.find((c) => c.userId === selectedUserId) ?? null;

  const rightPanel = (
    <CatalogRightPane
      className="h-full"
      contentClassName="px-4 py-4"
    >
      {/* Right: segments + channels + preview stacked vertically */}
      <div className="flex flex-col gap-3 overflow-y-auto">
        {/* Segment cards */}
        <div>
          <p className={cn(doctorSectionTitleClass, "mb-1.5")}>Сегменты</p>
          <SegmentCards
            metrics={metrics}
            allCount={clients.length}
            activeSegment={activeSegment}
            onSegmentChange={onSegmentChange}
          />
          <ChannelRow
            activeChannel={activeChannel}
            archivedOnly={archivedOnly}
            onChannelChange={onChannelChange}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-border/60" />

        {/* Patient preview */}
        <div>
          <p className={cn(doctorSectionTitleClass, "mb-2")}>Превью пациента</p>
          <PatientPreview client={selectedClient} />
        </div>
      </div>
    </CatalogRightPane>
  );

  return (
    <CatalogSplitLayout
      className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
      left={
        <CatalogLeftPane
          stickySplit={false}
          stickyToolbarRows={1}
          className="h-full"
          headerSlot={
            <div className="flex items-center justify-between gap-2">
              <p className={cn(doctorSectionTitleClass, "text-xs text-muted-foreground")}>
                {clients.length === 0
                  ? "Нет пациентов"
                  : `Пациентов: ${clients.length}`}
              </p>
              {isListPending && (
                <span className="text-xs text-muted-foreground animate-pulse">обновление…</span>
              )}
            </div>
          }
        >
          <div
            className={cn(
              "min-h-0 flex-1 overflow-hidden transition-opacity",
              isListPending && "opacity-70",
            )}
            aria-busy={isListPending}
          >
            {clients.length === 0 ? (
              <p className={doctorCatalogListEmptyClass}>
                {searchQuery.trim()
                  ? "Нет пациентов по запросу."
                  : "Нет пациентов по заданным фильтрам."}
              </p>
            ) : (
              <ul className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto">
                {clients.map((client) => (
                  <li key={client.userId}>
                    <PatientRow
                      client={client}
                      isActive={client.userId === selectedUserId}
                      onSelect={onSelectClient}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CatalogLeftPane>
      }
      right={rightPanel}
      mobileView={mobileView}
      mobileBackSlot={
        mobileView === "detail" ? (
          <Button variant="ghost" type="button" className="mb-2 h-9 px-2" onClick={onMobileBack}>
            ← Назад
          </Button>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Root: PatientsPageClient (manages client state + debounced search)
// ---------------------------------------------------------------------------

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 3;

export function PatientsPageClient({
  listPromise: initialListPromise,
  metricsPromise,
  initialFilters,
}: PatientsPageClientProps) {
  const router = useRouter();
  const [isListPending, startListTransition] = useTransition();

  // Search state (local, debounced)
  const [searchInput, setSearchInput] = useState(initialFilters.q);
  const [, setSearchQuery] = useState(initialFilters.q);
  const [listPromise, setListPromise] = useState<Promise<ClientListItem[]>>(initialListPromise);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Segment / channel / archive local state (sync to URL on change)
  const [activeSegment, setActiveSegment] = useState<string | null>(initialFilters.segment);
  const [activeChannel, setActiveChannel] = useState<string | null>(
    initialFilters.archivedOnly ? null : initialFilters.channel,
  );
  const [archivedOnly, setArchivedOnly] = useState(initialFilters.archivedOnly);

  // Selection state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  // When filters change (segment/channel/archived), navigate to update server filters
  const navigateWithFilters = useCallback(
    (overrides: {
      q?: string;
      segment?: string | null;
      channel?: string | null;
      archivedOnly?: boolean;
    }) => {
      const url = buildPatientListUrl({
        q: overrides.q ?? searchInput,
        segment: overrides.segment !== undefined ? overrides.segment : activeSegment,
        channel: overrides.channel !== undefined ? overrides.channel : activeChannel,
        archivedOnly: overrides.archivedOnly !== undefined ? overrides.archivedOnly : archivedOnly,
      });
      startListTransition(() => {
        router.push(url, { scroll: false });
      });
    },
    [router, searchInput, activeSegment, activeChannel, archivedOnly],
  );

  // Segment change
  const handleSegmentChange = useCallback(
    (value: string | null) => {
      setActiveSegment(value);
      setSelectedUserId(null);
      navigateWithFilters({ segment: value });
    },
    [navigateWithFilters],
  );

  // Channel/archive change
  const handleChannelChange = useCallback(
    (channel: string | null, archived: boolean) => {
      setActiveChannel(channel);
      setArchivedOnly(archived);
      setSelectedUserId(null);
      navigateWithFilters({ channel, archivedOnly: archived });
    },
    [navigateWithFilters],
  );

  // Search input: debounce then refetch via the API endpoint (client-side fetch for correctness)
  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      if (trimmed.length === 0 || trimmed.length >= SEARCH_MIN_CHARS) {
        debounceRef.current = setTimeout(() => {
          setSearchQuery(trimmed);
          setSelectedUserId(null);
          // Refetch from API endpoint for accurate backend search
          const sp = new URLSearchParams();
          if (trimmed) sp.set("q", trimmed);
          if (activeSegment) sp.set("segment", activeSegment);
          if (activeChannel) sp.set("channel", activeChannel);
          if (archivedOnly) sp.set("archived", "true");
          const url = `/api/doctor/patients?${sp.toString()}`;
          const newPromise = fetch(url)
            .then((r) => {
              if (!r.ok) throw new Error(`Patients fetch failed: ${r.status}`);
              return r.json() as Promise<{ clients: ClientListItem[] }>;
            })
            .then((data) => data.clients);
          startListTransition(() => {
            setListPromise(newPromise);
          });
        }, SEARCH_DEBOUNCE_MS);
      }
    },
    [activeSegment, activeChannel, archivedOnly],
  );

  // Keep listPromise in sync with server-side navigation (initial load)
  useEffect(() => {
    setListPromise(initialListPromise);
    setSearchInput(initialFilters.q);
    setActiveSegment(initialFilters.segment);
    setActiveChannel(initialFilters.archivedOnly ? null : initialFilters.channel);
    setArchivedOnly(initialFilters.archivedOnly);
    setSelectedUserId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialListPromise]);

  const handleSelectClient = useCallback((userId: string) => {
    setSelectedUserId(userId);
    setMobileView("detail");
  }, []);

  const handleMobileBack = useCallback(() => {
    setMobileView("list");
    setSelectedUserId(null);
  }, []);

  const clearSearch = () => {
    setSearchInput("");
    handleSearchInput("");
  };

  return (
    <DoctorCatalogPageLayout
      toolbar={
        <DoctorCatalogFiltersToolbar
          filters={
            <DoctorCatalogToolbarFiltersSlot>
              {/* Search input */}
              <div className="relative flex min-w-0 max-w-xs flex-1 items-center">
                <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden />
                <Input
                  type="search"
                  placeholder="Поиск (от 3 символов)"
                  value={searchInput}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  className="pl-8 pr-8 text-sm"
                  aria-label="Поиск пациентов"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 text-muted-foreground hover:text-foreground"
                    aria-label="Сбросить поиск"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {/* Active filter badges */}
              {activeSegment && (
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {SEGMENTS.find((s) => s.value === activeSegment)?.label ?? activeSegment}
                  <button
                    type="button"
                    onClick={() => handleSegmentChange(null)}
                    className="hover:text-primary/70"
                    aria-label="Снять фильтр сегмента"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {activeChannel && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                  {CHANNELS.find((c) => c.key === activeChannel)?.label ?? activeChannel}
                  <button
                    type="button"
                    onClick={() => handleChannelChange(null, false)}
                    className="hover:text-muted-foreground"
                    aria-label="Снять фильтр канала"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {archivedOnly && (
                <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                  Архив
                  <button
                    type="button"
                    onClick={() => handleChannelChange(null, false)}
                    className="hover:text-muted-foreground"
                    aria-label="Выйти из архива"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}
            </DoctorCatalogToolbarFiltersSlot>
          }
        />
      }
    >
      <Suspense fallback={<PatientListSkeleton />}>
        <PatientsContent
          listPromise={listPromise}
          metricsPromise={metricsPromise}
          activeSegment={activeSegment}
          activeChannel={activeChannel}
          archivedOnly={archivedOnly}
          searchQuery={searchInput}
          selectedUserId={selectedUserId}
          isListPending={isListPending}
          onSegmentChange={handleSegmentChange}
          onChannelChange={handleChannelChange}
          onSelectClient={handleSelectClient}
          onMobileBack={handleMobileBack}
          mobileView={mobileView}
        />
      </Suspense>
    </DoctorCatalogPageLayout>
  );
}
