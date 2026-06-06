"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Ban,
  CalendarDays,
  Dumbbell,
  Handshake,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Smartphone,
  Ticket,
} from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import { doctorClientListRowLinkClass } from "./doctorClientCardChrome";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "../analytics/clients/DoctorStatCard";
import { doctorListItemOuterClass } from "@/shared/ui/doctor/doctorVisual";

type ClientsScope = "all" | "archived";
type ClientSegment = "all" | "appointments" | "support" | "program";

type UrlParams = {
  q?: string;
  segment?: string;
  telegram?: string;
  max?: string;
  email?: string;
  phone?: string;
  visitedMonth?: string;
  cancellations?: string;
  reschedules?: string;
  withoutAppointments?: string;
  memberships?: string;
  appointmentFilter?: string;
  messageFilter?: string;
  commentFilter?: string;
  membershipFilter?: string;
  supportFilter?: string;
  telegramFilter?: string;
  maxFilter?: string;
  emailFilter?: string;
  phoneFilter?: string;
  appFilter?: string;
  scope?: string;
  /** Legacy query params kept for backwards compatibility. */
  appointment?: string;
  treatmentProgram?: string;
  support?: string;
};

type Props = {
  allClients: ClientListItem[];
  urlParams: UrlParams;
  basePath?: string;
};

const DEFAULT_BASE = "/app/doctor/clients";
const CLIENT_ICON_RAIL_CLASS = "grid shrink-0 grid-cols-[repeat(10,1.75rem)] gap-1";

type TriFilterState = "off" | "positive" | "negative";
type RichFilterState = "off" | "positive" | "new" | "negative";

type IconFiltersState = {
  appointments: RichFilterState;
  messages: RichFilterState;
  comments: RichFilterState;
  memberships: TriFilterState;
  support: TriFilterState;
  telegram: TriFilterState;
  max: TriFilterState;
  email: TriFilterState;
  phone: TriFilterState;
  app: TriFilterState;
};

type ClientFiltersState = {
  telegram: boolean;
  max: boolean;
  email: boolean;
  phone: boolean;
  visitedMonth: boolean;
  cancellations: boolean;
  reschedules: boolean;
  withoutAppointments: boolean;
  memberships: boolean;
};

function clientRowHref(c: ClientListItem, basePath: string, scope: ClientsScope): string {
  return `${basePath}/${encodeURIComponent(c.userId)}?scope=${encodeURIComponent(scope)}`;
}

function resolveSegment(urlParams: UrlParams): ClientSegment {
  if (urlParams.segment === "appointments") return "appointments";
  if (urlParams.segment === "support") return "support";
  if (urlParams.segment === "program") return "program";
  // Legacy deep links.
  if (urlParams.scope === "appointments") return "appointments";
  if (urlParams.support === "on") return "support";
  if (urlParams.treatmentProgram === "1") return "program";
  if (urlParams.appointment === "1") return "appointments";
  return "all";
}

function matchesSearch(item: ClientListItem, query: string): boolean {
  const s = query.toLowerCase().trim();
  if (!s) return true;
  return (
    item.displayName.toLowerCase().includes(s) ||
    (item.phone ?? "").toLowerCase().includes(s) ||
    (item.bindings.telegramId ?? "").toLowerCase().includes(s) ||
    (item.bindings.maxId ?? "").toLowerCase().includes(s)
  );
}

function hasAppointmentHistory(item: ClientListItem): boolean {
  if (typeof item.hasAppointmentHistory === "boolean") return item.hasAppointmentHistory;
  return (item.activeAppointmentsCount ?? 0) > 0 || Boolean(item.nextAppointmentLabel);
}

function hasActiveAppointments(item: ClientListItem): boolean {
  return (item.activeAppointmentsCount ?? 0) > 0;
}

function hasMemberships(item: ClientListItem): boolean {
  return item.hasMemberships === true;
}

function parseTriFilterState(raw: string | undefined, fallbackPositive = false): TriFilterState {
  if (raw === "yes") return "positive";
  if (raw === "no") return "negative";
  return fallbackPositive ? "positive" : "off";
}

function parseRichFilterState(raw: string | undefined, fallbackNegative = false): RichFilterState {
  if (raw === "yes") return "positive";
  if (raw === "new") return "new";
  if (raw === "no") return "negative";
  return fallbackNegative ? "negative" : "off";
}

function cycleTriFilterState(state: TriFilterState): TriFilterState {
  if (state === "off") return "positive";
  if (state === "positive") return "negative";
  return "off";
}

function cycleRichFilterState(state: RichFilterState): RichFilterState {
  if (state === "off") return "positive";
  if (state === "positive") return "new";
  if (state === "new") return "negative";
  return "off";
}

function applyTriFilter(
  list: ClientListItem[],
  state: TriFilterState,
  predicate: (item: ClientListItem) => boolean,
): ClientListItem[] {
  if (state === "off") return list;
  if (state === "positive") return list.filter(predicate);
  return list.filter((item) => !predicate(item));
}

function applyRichFilter(
  list: ClientListItem[],
  state: RichFilterState,
  hasPredicate: (item: ClientListItem) => boolean,
  newPredicate: (item: ClientListItem) => boolean,
): ClientListItem[] {
  if (state === "off") return list;
  if (state === "positive") return list.filter(hasPredicate);
  if (state === "new") return list.filter(newPredicate);
  return list.filter((item) => !hasPredicate(item));
}

function syncLegacyFiltersFromIconFilters(
  base: ClientFiltersState,
  iconFilters: IconFiltersState,
): ClientFiltersState {
  return {
    ...base,
    telegram: iconFilters.telegram === "positive",
    max: iconFilters.max === "positive",
    email: iconFilters.email === "positive",
    phone: iconFilters.phone === "positive",
    withoutAppointments: iconFilters.appointments === "negative",
    memberships: iconFilters.memberships === "positive",
  };
}

function readInitialFilters(urlParams: UrlParams): ClientFiltersState {
  return {
    telegram: urlParams.telegram === "1",
    max: urlParams.max === "1",
    email: urlParams.email === "1",
    phone: urlParams.phone === "1",
    visitedMonth: urlParams.visitedMonth === "1",
    cancellations: urlParams.cancellations === "1",
    reschedules: urlParams.reschedules === "1",
    withoutAppointments: urlParams.withoutAppointments === "1",
    memberships: urlParams.memberships === "1",
  };
}

function readInitialIconFilters(urlParams: UrlParams): IconFiltersState {
  return {
    appointments: parseRichFilterState(urlParams.appointmentFilter, urlParams.withoutAppointments === "1"),
    messages: parseRichFilterState(urlParams.messageFilter),
    comments: parseRichFilterState(urlParams.commentFilter),
    memberships: parseTriFilterState(urlParams.membershipFilter, urlParams.memberships === "1"),
    support: parseTriFilterState(urlParams.supportFilter),
    telegram: parseTriFilterState(urlParams.telegramFilter, urlParams.telegram === "1"),
    max: parseTriFilterState(urlParams.maxFilter, urlParams.max === "1"),
    email: parseTriFilterState(urlParams.emailFilter, urlParams.email === "1"),
    phone: parseTriFilterState(urlParams.phoneFilter, urlParams.phone === "1"),
    app: parseTriFilterState(urlParams.appFilter),
  };
}

type ClientListFilterOptions = {
  scope: ClientsScope;
  segment: ClientSegment;
  search: string;
  filters: ClientFiltersState;
  iconFilters: IconFiltersState;
  ignoreSegment?: boolean;
  ignoreAppointmentSegment?: boolean;
  ignoreAppointmentFilter?: boolean;
};

function filterClientList(
  allClients: ClientListItem[],
  {
    scope,
    segment,
    search,
    filters,
    iconFilters,
    ignoreSegment = false,
    ignoreAppointmentSegment = false,
    ignoreAppointmentFilter = false,
  }: ClientListFilterOptions,
): ClientListItem[] {
  const q = search.trim();
  let list = allClients;
  if (!ignoreSegment && scope !== "archived") {
    if (segment === "appointments" && !ignoreAppointmentSegment) {
      list = list.filter((c) => hasActiveAppointments(c));
    } else if (segment === "support") {
      list = list.filter((c) => c.isOnSupport === true);
    } else if (segment === "program") {
      list = list.filter((c) => c.activeTreatmentProgram);
    }
  }
  if (q.length >= 3) {
    list = list.filter((c) => matchesSearch(c, q));
  }
  if (filters.visitedMonth) {
    list = list.filter((c) => c.visitedThisCalendarMonth === true);
  }
  if (filters.cancellations) {
    list = list.filter((c) => c.cancellationCount30d > 0);
  }
  if (filters.reschedules) {
    list = list.filter((c) => (c.rescheduleCount30d ?? 0) > 0);
  }
  if (!ignoreAppointmentFilter) {
    list = applyRichFilter(
      list,
      iconFilters.appointments,
      (c) => hasAppointmentHistory(c),
      (c) => hasActiveAppointments(c),
    );
  }
  list = applyRichFilter(
    list,
    iconFilters.messages,
    (c) => (c.hasConversation ?? false) || (c.unreadMessagesCount ?? 0) > 0,
    (c) => (c.unreadMessagesCount ?? 0) > 0,
  );
  list = applyRichFilter(
    list,
    iconFilters.comments,
    (c) => c.activeTreatmentProgram,
    (c) => (c.unreadExerciseCommentsCount ?? 0) > 0,
  );
  list = applyTriFilter(list, iconFilters.memberships, (c) => hasMemberships(c));
  list = applyTriFilter(list, iconFilters.support, (c) => c.isOnSupport === true);
  list = applyTriFilter(list, iconFilters.telegram, (c) => Boolean(c.bindings.telegramId?.trim()));
  list = applyTriFilter(list, iconFilters.max, (c) => Boolean(c.bindings.maxId?.trim()));
  list = applyTriFilter(list, iconFilters.email, (c) => c.hasEmail === true);
  list = applyTriFilter(list, iconFilters.phone, (c) => Boolean(c.phone?.trim()));
  list = applyTriFilter(list, iconFilters.app, (c) => c.hasApp === true);
  return list;
}

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
  children: ReactNode;
};

function IconSlot({ visible, label, title, badge, children }: IconSlotProps) {
  if (!visible) {
    return <span className="inline-flex size-7 shrink-0" aria-hidden />;
  }
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center">
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

type HeaderIconButtonProps = {
  label: string;
  title: string;
  state: TriFilterState | RichFilterState;
  onClick: () => void;
  children: ReactNode;
};

function HeaderIconButton({ label, title, state, onClick, children }: HeaderIconButtonProps) {
  const isPositive = state === "positive" || state === "new";
  const isNegative = state === "negative";
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className={[
        "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
        isPositive
          ? "border-primary/50 bg-primary/15 text-primary"
          : isNegative
            ? "border-slate-500/60 bg-slate-600/20 text-slate-700 dark:text-slate-300"
            : "border-border/60 bg-muted/40 text-muted-foreground",
      ].join(" ")}
    >
      {children}
      {state === "new" ? (
        <span
          className="absolute -right-1 -top-1 inline-flex size-2.5 rounded-full bg-destructive"
          aria-hidden
        />
      ) : null}
      {isNegative ? (
        <span className="absolute -right-1 -top-1 inline-flex size-3.5 items-center justify-center rounded-full bg-background">
          <Ban className="size-3 text-destructive" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

export function DoctorClientsPanel({
  allClients,
  urlParams,
  basePath = DEFAULT_BASE,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(urlParams.q ?? "");
  const [scope, setScope] = useState<ClientsScope>(() => (urlParams.scope === "archived" ? "archived" : "all"));
  const [segment, setSegment] = useState<ClientSegment>(() => resolveSegment(urlParams));
  const [filters, setFilters] = useState<ClientFiltersState>(() => readInitialFilters(urlParams));
  const [iconFilters, setIconFilters] = useState<IconFiltersState>(() => readInitialIconFilters(urlParams));

  const filtered = useMemo(
    () => filterClientList(allClients, { scope, segment, search, filters, iconFilters }),
    [allClients, filters, iconFilters, scope, search, segment],
  );

  const segmentCounts = useMemo(() => {
    const segmentBase = filterClientList(allClients, {
      scope,
      segment,
      search,
      filters,
      iconFilters,
      ignoreSegment: true,
      ignoreAppointmentFilter: true,
    });
    const withoutAppointmentsBase = filterClientList(allClients, {
      scope,
      segment,
      search,
      filters,
      iconFilters,
      ignoreAppointmentSegment: true,
      ignoreAppointmentFilter: true,
    });
    return {
      all: segmentBase.length,
      appointments: segmentBase.filter((c) => hasActiveAppointments(c)).length,
      withoutAppointments: withoutAppointmentsBase.filter((c) => !hasAppointmentHistory(c)).length,
      support: segmentBase.filter((c) => c.isOnSupport === true).length,
      program: segmentBase.filter((c) => c.activeTreatmentProgram).length,
    };
  }, [allClients, filters, iconFilters, scope, search, segment]);

  const onSegmentChange = useCallback(
    (nextSegment: ClientSegment) => {
      if (scope === "archived") {
        const params = new URLSearchParams({ scope: "all" });
        if (nextSegment !== "all") params.set("segment", nextSegment);
        router.replace(`${basePath}?${params.toString()}`);
        return;
      }
      const nextIconFilters: IconFiltersState =
        nextSegment === "appointments" && iconFilters.appointments === "negative"
          ? { ...iconFilters, appointments: "off" }
          : iconFilters;
      setScope("all");
      setSegment(nextSegment);
      setIconFilters(nextIconFilters);
      setFilters(syncLegacyFiltersFromIconFilters(filters, nextIconFilters));
    },
    [basePath, filters, iconFilters, router, scope],
  );

  const onArchiveToggle = useCallback(() => {
    const nextScope: ClientsScope = scope === "archived" ? "all" : "archived";
    router.replace(`${basePath}?scope=${encodeURIComponent(nextScope)}`);
  }, [basePath, router, scope]);

  const onToggleFilter = useCallback(
    (key: keyof typeof filters) => {
      const nextValue = !filters[key];
      const nextIconFilters: IconFiltersState = { ...iconFilters };
      if (key === "telegram") nextIconFilters.telegram = nextValue ? "positive" : "off";
      if (key === "max") nextIconFilters.max = nextValue ? "positive" : "off";
      if (key === "email") nextIconFilters.email = nextValue ? "positive" : "off";
      if (key === "phone") nextIconFilters.phone = nextValue ? "positive" : "off";
      if (key === "memberships") nextIconFilters.memberships = nextValue ? "positive" : "off";
      if (key === "withoutAppointments") nextIconFilters.appointments = nextValue ? "negative" : "off";
      const nextSegment: ClientSegment =
        nextIconFilters.appointments === "negative" && segment === "appointments" ? "all" : segment;
      const nextFilters = syncLegacyFiltersFromIconFilters(
        {
          ...filters,
          [key]: nextValue,
        },
        nextIconFilters,
      );
      setSegment(nextSegment);
      setIconFilters(nextIconFilters);
      setFilters(nextFilters);
    },
    [filters, iconFilters, segment],
  );

  const onCycleTriIconFilter = useCallback(
    (key: Exclude<keyof IconFiltersState, "appointments" | "messages" | "comments">) => {
      const nextIconFilters: IconFiltersState = {
        ...iconFilters,
        [key]: cycleTriFilterState(iconFilters[key]),
      };
      setIconFilters(nextIconFilters);
      setFilters(syncLegacyFiltersFromIconFilters(filters, nextIconFilters));
    },
    [filters, iconFilters],
  );

  const onCycleRichIconFilter = useCallback(
    (key: Extract<keyof IconFiltersState, "appointments" | "messages" | "comments">) => {
      const nextIconFilters: IconFiltersState = {
        ...iconFilters,
        [key]: cycleRichFilterState(iconFilters[key]),
      };
      const nextSegment: ClientSegment =
        key === "appointments" && nextIconFilters.appointments === "negative" && segment === "appointments"
          ? "all"
          : segment;
      setSegment(nextSegment);
      setIconFilters(nextIconFilters);
      setFilters(syncLegacyFiltersFromIconFilters(filters, nextIconFilters));
    },
    [filters, iconFilters, segment],
  );

  return (
    <>
      <form
        id="doctor-clients-search-form"
        onSubmit={(e) => e.preventDefault()}
        className="mb-2 flex flex-col gap-3"
      >
        <Input
          type="search"
          placeholder="Поиск (от 3 символов)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Поиск в списке"
        />
        {search.length > 0 && search.trim().length < 3 ? (
          <p className="text-muted-foreground text-xs">Введите еще {3 - search.trim().length} симв.</p>
        ) : null}
      </form>

      <div className="grid min-h-0 gap-3 lg:grid-cols-2 lg:items-start">
        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card lg:h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-10rem)] lg:overflow-hidden">
          <div className="sticky top-0 z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 bg-card px-5 py-2">
            <p className="min-w-0 truncate text-xs text-muted-foreground">Пациентов: {filtered.length}</p>
            <div className={CLIENT_ICON_RAIL_CLASS} aria-label="Фильтры списка">
              <HeaderIconButton
                label="Фильтр записей"
                title="Записи: все состояния -> с записями -> с активными -> без записей"
                state={iconFilters.appointments}
                onClick={() => onCycleRichIconFilter("appointments")}
              >
                <CalendarDays className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр переписки"
                title="Переписка: все состояния -> с перепиской -> с непрочитанными -> без переписки"
                state={iconFilters.messages}
                onClick={() => onCycleRichIconFilter("messages")}
              >
                <MessageSquare className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр комментариев"
                title="Комментарии по упражнениям: все -> есть -> новые -> нет"
                state={iconFilters.comments}
                onClick={() => onCycleRichIconFilter("comments")}
              >
                <Dumbbell className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр сопровождения"
                title="Сопровождение: все -> на сопровождении -> не на сопровождении"
                state={iconFilters.support}
                onClick={() => onCycleTriIconFilter("support")}
              >
                <Handshake className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр абонементов"
                title="Абонементы: все -> с абонементами -> без абонементов"
                state={iconFilters.memberships}
                onClick={() => onCycleTriIconFilter("memberships")}
              >
                <Ticket className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр телефона"
                title="Телефон: все -> есть телефон -> нет телефона"
                state={iconFilters.phone}
                onClick={() => onCycleTriIconFilter("phone")}
              >
                <Phone className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр Telegram"
                title="Telegram: все -> подключен -> не подключен"
                state={iconFilters.telegram}
                onClick={() => onCycleTriIconFilter("telegram")}
              >
                <Send className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр MAX"
                title="MAX: все -> подключен -> не подключен"
                state={iconFilters.max}
                onClick={() => onCycleTriIconFilter("max")}
              >
                <span className="text-[10px] font-semibold leading-none">М</span>
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр email"
                title="Email: все -> указан -> не указан"
                state={iconFilters.email}
                onClick={() => onCycleTriIconFilter("email")}
              >
                <Mail className="size-3.5" aria-hidden />
              </HeaderIconButton>
              <HeaderIconButton
                label="Фильтр приложения"
                title="Приложение: все -> есть приложение -> нет приложения"
                state={iconFilters.app}
                onClick={() => onCycleTriIconFilter("app")}
              >
                <Smartphone className="size-3.5" aria-hidden />
              </HeaderIconButton>
            </div>
          </div>
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Нет записей по текущим фильтрам.</p>
          ) : (
            <ul id="doctor-clients-list" className="m-0 min-h-0 flex-1 list-none space-y-1.5 overflow-y-auto p-2">
              {filtered.map((c) => {
                const appointmentCount = c.activeAppointmentsCount ?? (c.nextAppointmentLabel ? 1 : 0);
                const unreadMessagesCount = c.unreadMessagesCount ?? 0;
                const unreadExerciseCommentsCount = c.unreadExerciseCommentsCount ?? 0;
                return (
                  <li key={c.userId} id={`doctor-clients-item-${c.userId}`} className={doctorListItemOuterClass}>
                    <Link
                      id={`doctor-clients-card-${c.userId}`}
                      href={clientRowHref(c, basePath, scope)}
                      className={`${doctorClientListRowLinkClass} items-center`}
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{c.displayName}</span>
                      </div>
                      <div className={CLIENT_ICON_RAIL_CLASS}>
                        <IconSlot
                          visible={hasAppointmentHistory(c)}
                          label={`История записей${appointmentCount > 0 ? `, активных: ${appointmentCount}` : ""}`}
                          title="История записей"
                          badge={appointmentCount > 0 ? appointmentCount : undefined}
                        >
                          <CalendarDays className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={(c.hasConversation ?? false) || unreadMessagesCount > 0}
                          label={`Переписка${unreadMessagesCount > 0 ? `, непрочитанных: ${unreadMessagesCount}` : ""}`}
                          title="Переписка"
                          badge={unreadMessagesCount > 0 ? unreadMessagesCount : undefined}
                        >
                          <MessageSquare className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={c.activeTreatmentProgram}
                          label={`Программа тренировок${unreadExerciseCommentsCount > 0 ? `, новых комментариев: ${unreadExerciseCommentsCount}` : ""}`}
                          title="Назначенная программа тренировок"
                          badge={unreadExerciseCommentsCount > 0 ? unreadExerciseCommentsCount : undefined}
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
                          visible={hasMemberships(c)}
                          label="Есть абонемент"
                          title="Есть абонемент"
                        >
                          <Ticket className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot visible={Boolean(c.phone?.trim())} label="Телефон указан" title="Телефон указан">
                          <Phone className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={Boolean(c.bindings.telegramId?.trim())}
                          label="Подключён Telegram"
                          title="Подключён Telegram"
                        >
                          <Send className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot
                          visible={Boolean(c.bindings.maxId?.trim())}
                          label="Подключён MAX"
                          title="Подключён MAX"
                        >
                          <span className="text-[10px] font-semibold leading-none">М</span>
                        </IconSlot>
                        <IconSlot visible={c.hasEmail === true} label="Указан email" title="Указан email">
                          <Mail className="size-3.5" aria-hidden />
                        </IconSlot>
                        <IconSlot visible={c.hasApp === true} label="Есть приложение" title="Есть приложение">
                          <Smartphone className="size-3.5" aria-hidden />
                        </IconSlot>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-3">
          <DoctorMetricList className="grid-cols-2 xl:grid-cols-2">
            <DoctorStatCard
              id="doctor-clients-segment-all"
              title="Все"
              value={segmentCounts.all}
              tone={scope === "archived" ? "warning" : "neutral"}
              onClick={() => onSegmentChange("all")}
            />
            <DoctorStatCard
              id="doctor-clients-segment-appointments"
              title="С записями"
              value={segmentCounts.appointments}
              tone={segment === "appointments" && scope !== "archived" ? "warning" : "neutral"}
              onClick={() => onSegmentChange("appointments")}
            />
            <DoctorStatCard
              id="doctor-clients-segment-support"
              title="На сопровождении"
              value={segmentCounts.support}
              tone={segment === "support" && scope !== "archived" ? "warning" : "neutral"}
              onClick={() => onSegmentChange("support")}
            />
            <DoctorStatCard
              id="doctor-clients-segment-program"
              title="С программой"
              value={segmentCounts.program}
              tone={segment === "program" && scope !== "archived" ? "warning" : "neutral"}
              onClick={() => onSegmentChange("program")}
            />
          </DoctorMetricList>

          <div className="mt-3 border-t border-border/60 pt-3">
            <p className="mb-2 text-xs text-muted-foreground">Дополнительные фильтры</p>
            <div id="doctor-clients-filters" className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={filters.telegram ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("telegram")}
                aria-pressed={filters.telegram}
              >
                Telegram
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.max ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("max")}
                aria-pressed={filters.max}
              >
                MAX
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.email ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("email")}
                aria-pressed={filters.email}
              >
                Email
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.phone ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("phone")}
                aria-pressed={filters.phone}
              >
                Телефон
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.visitedMonth ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("visitedMonth")}
                aria-pressed={filters.visitedMonth}
              >
                Приём в этом месяце
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.cancellations ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("cancellations")}
                aria-pressed={filters.cancellations}
              >
                Есть отмены
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.reschedules ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("reschedules")}
                aria-pressed={filters.reschedules}
              >
                Есть переносы
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.withoutAppointments ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("withoutAppointments")}
                aria-pressed={filters.withoutAppointments}
              >
                Без записей ({segmentCounts.withoutAppointments})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.memberships ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => onToggleFilter("memberships")}
                aria-pressed={filters.memberships}
              >
                С абонементами
              </Button>
              <Button
                type="button"
                size="sm"
                variant={scope === "archived" ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={onArchiveToggle}
                aria-pressed={scope === "archived"}
              >
                Архив
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
