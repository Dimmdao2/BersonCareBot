"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Dumbbell, Handshake, Mail, MessageSquare, Phone, Send, Smartphone } from "lucide-react";
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

function hasMemberships(item: ClientListItem): boolean {
  return item.hasMemberships === true;
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
    return <span className="inline-flex size-6 shrink-0" aria-hidden />;
  }
  return (
    <span
      className="relative inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground"
      aria-label={label}
      title={title}
    >
      {children}
      {iconBadge(badge ?? 0)}
    </span>
  );
}

export function DoctorClientsPanel({
  allClients,
  urlParams,
  basePath = DEFAULT_BASE,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(urlParams.q ?? "");
  const scope: ClientsScope = urlParams.scope === "archived" ? "archived" : "all";
  const segment = resolveSegment(urlParams);
  const filters = useMemo(
    () => ({
      telegram: urlParams.telegram === "1",
      max: urlParams.max === "1",
      email: urlParams.email === "1",
      phone: urlParams.phone === "1",
      visitedMonth: urlParams.visitedMonth === "1",
      cancellations: urlParams.cancellations === "1",
      reschedules: urlParams.reschedules === "1",
      withoutAppointments: urlParams.withoutAppointments === "1",
      memberships: urlParams.memberships === "1",
    }),
    [urlParams],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    let list = allClients;
    if (scope !== "archived") {
      if (segment === "appointments") {
        list = list.filter((c) => hasAppointmentHistory(c));
      } else if (segment === "support") {
        list = list.filter((c) => c.isOnSupport === true);
      } else if (segment === "program") {
        list = list.filter((c) => c.activeTreatmentProgram);
      }
    }
    if (q.length >= 3) {
      list = list.filter((c) => matchesSearch(c, q));
    }
    if (filters.telegram) {
      list = list.filter((c) => Boolean(c.bindings.telegramId?.trim()));
    }
    if (filters.max) {
      list = list.filter((c) => Boolean(c.bindings.maxId?.trim()));
    }
    if (filters.email) {
      list = list.filter((c) => c.hasEmail === true);
    }
    if (filters.phone) {
      list = list.filter((c) => Boolean(c.phone?.trim()));
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
    if (filters.withoutAppointments) {
      list = list.filter((c) => !hasAppointmentHistory(c));
    }
    if (filters.memberships) {
      list = list.filter((c) => hasMemberships(c));
    }
    return list;
  }, [allClients, filters, scope, search, segment]);

  const segmentCounts = useMemo(
    () => ({
      all: allClients.length,
      appointments: allClients.filter((c) => hasAppointmentHistory(c)).length,
      withoutAppointments: allClients.filter((c) => !hasAppointmentHistory(c)).length,
      support: allClients.filter((c) => c.isOnSupport === true).length,
      program: allClients.filter((c) => c.activeTreatmentProgram).length,
    }),
    [allClients],
  );

  const pushState = useCallback(
    (next: {
      scope: ClientsScope;
      segment: ClientSegment;
      telegram: boolean;
      max: boolean;
      email: boolean;
      phone: boolean;
      visitedMonth: boolean;
      cancellations: boolean;
      reschedules: boolean;
      withoutAppointments: boolean;
      memberships: boolean;
    }) => {
      const params = new URLSearchParams();
      params.set("scope", next.scope);
      if (next.scope !== "archived" && next.segment !== "all") params.set("segment", next.segment);
      if (next.telegram) params.set("telegram", "1");
      if (next.max) params.set("max", "1");
      if (next.email) params.set("email", "1");
      if (next.phone) params.set("phone", "1");
      if (next.visitedMonth) params.set("visitedMonth", "1");
      if (next.cancellations) params.set("cancellations", "1");
      if (next.reschedules) params.set("reschedules", "1");
      if (next.withoutAppointments) params.set("withoutAppointments", "1");
      if (next.memberships) params.set("memberships", "1");
      const query = params.toString();
      router.replace(`${basePath}${query ? `?${query}` : ""}`);
    },
    [basePath, router],
  );

  const onSegmentChange = useCallback(
    (nextSegment: ClientSegment) => {
      pushState({
        scope: "all",
        segment: nextSegment,
        ...filters,
        withoutAppointments: nextSegment === "appointments" ? false : filters.withoutAppointments,
      });
    },
    [filters, pushState],
  );

  const onArchiveToggle = useCallback(() => {
    const nextScope: ClientsScope = scope === "archived" ? "all" : "archived";
    pushState({
      scope: nextScope,
      segment,
      ...filters,
    });
  }, [filters, pushState, scope, segment]);

  const onToggleFilter = useCallback(
    (key: keyof typeof filters) => {
      const nextValue = !filters[key];
      const nextSegment: ClientSegment =
        key === "withoutAppointments" && nextValue && segment === "appointments" ? "all" : segment;
      pushState({
        scope,
        segment: nextSegment,
        ...filters,
        [key]: nextValue,
      });
    },
    [filters, pushState, scope, segment],
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
          <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
            <p className="text-xs text-muted-foreground">Пациентов: {filtered.length}</p>
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
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex shrink-0 items-center gap-1">
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
                        </div>

                        <div className="ml-1 flex shrink-0 items-center gap-1">
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
