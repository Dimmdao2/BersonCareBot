'use client';

import 'react-day-picker/style.css';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import dynamic from 'next/dynamic';
import { DateTime } from 'luxon';
import { DayPicker } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { CalendarDays, Columns3, Filter, List, Search } from 'lucide-react';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorCatalogStickyToolbar } from '@/shared/ui/doctor/DoctorCatalogStickyToolbar';
import {
  DOCTOR_CALENDAR_TODAY_MARKER_CLASS,
  buildDoctorCalendarNonWorkingRanges,
  doctorCalendarAppointmentBranchColors,
  doctorCalendarAppointmentClassName,
  doctorCalendarAppointmentDisplay,
  doctorCalendarNonWorkingClassNames,
  formatDoctorCalendarHour,
} from '@/shared/ui/doctor/calendar/doctorCalendarPresentation';
import {
  DOCTOR_ACTIVE_FILTER_BUTTON_CLASS,
  DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
  DoctorSchedulePeriodNav,
} from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { cn } from '@/lib/utils';
import { DEFAULT_APP_DISPLAY_TIMEZONE } from '@/modules/system-settings/calendarIana';
import type { PendingReschedule } from '../../calendar/DoctorCalendarRescheduleDialog';
import { DoctorCalendarToolbarFilter } from '../../calendar/DoctorCalendarToolbarFilter';
import { resolveCalendarCreateFieldValue } from '@/modules/booking-calendar/calendarCreateFieldMode';
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
} from '@/modules/booking-calendar/appointmentStatusLabels';
import type FullCalendar from '@fullcalendar/react';
import type { CalendarOptions as FullCalendarOptions, EventInput } from '@fullcalendar/core';
import type {
  CalendarAppointmentEvent,
  CalendarEvent,
  CalendarFilterMeta,
} from '@/modules/booking-calendar/types';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { ScheduleTabProps } from '../scheduleTabRegistry';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import { DoctorResultCount } from '@/shared/ui/doctor/DoctorResultCount';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { routePaths } from '@/app-layer/routes/paths';
import { DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT } from '../scheduleCalendarEvents';
import { patientCardHref } from '../../patients/patientCardHref';
import { DoctorAppointmentIndicators } from '../../calendar/DoctorAppointmentIndicators';
import { deriveCalendarInitialScrollTime } from '@/modules/booking-calendar/visibleTimeWindow';
import {
  addBreakToWorkingDay,
  intersectsAny,
  openWorkingDayIntervalForBooking,
  openWorkingHoursForSelection,
  type MinuteInterval,
} from '@/modules/booking-scheduling/workingDayBreakEdits';
import {
  doctorScheduleScopeQuery,
  resolveDoctorScheduleScopeState,
  type DoctorScheduleScopeBootstrap,
  type DoctorScheduleScopeState,
  type ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import {
  isScheduleCalendarBootstrap,
  type ScheduleCalendarFeedSnapshot,
} from '../scheduleCalendarBootstrapTypes';
import { visibleRange } from '../scheduleCalendarRange';
import {
  DEFAULT_CALENDAR_SETTINGS,
  parseCalendarDoctorSettings,
  type CalendarDoctorSettings,
} from '../scheduleCalendarSettings';
import { KpiRowTab } from './kpi/ScheduleKpiRow';
import { ListView } from './list/ScheduleListView';
import {
  API_BASE,
  APPOINTMENT_FEED_API,
  APPOINTMENT_FEED_HISTORY_MONTHS,
  APPOINTMENT_FEED_PAGE_SIZE,
  CALENDAR_SELECTION_ACTION_LABELS,
  CREATE_PANEL_REVEAL_DELAY_MS,
  EMPTY_SCHEDULE_SCOPE_BOOTSTRAP,
  INACTIVE_TOOLBAR_BUTTON_CLASS,
  KPIS_API,
  MAX_WORKING_DAY_BREAKS,
  NO_KPI_FILTERS,
  SELECTION_MUTATION_ERRORS,
  type AppointmentFeedResponse,
  type CalendarDraftSlot,
  type CalendarGridSelection,
  type CalendarResponse,
  type CalendarSelectionAction,
  type CalendarSelectionKind,
  type CalV26View,
  type OpenWorkingHoursDialogState,
  type RenderMode,
  type ScheduleKpiFilterKey,
} from './scheduleCalendarTypes';
import {
  buildQuery,
  eventClassName,
  eventDayInterval,
  eventLastName,
  eventTitle,
  kpiPeriodLabel,
  listPeriodNavLabel,
  mergeAppointmentPages,
  parseFeedInstant,
  periodNavLabel,
  readCachedScheduleFilters,
  rescheduleErrorLabel,
  resolveAnchorDate,
  resolveRenderMode,
  resolveView,
  scheduleCalendarLoadKey,
  toFcDate,
  writeCachedScheduleFilters,
} from './scheduleCalendarUtils';
type FullCalendarInstance = InstanceType<typeof FullCalendar>;

const DUPLICATE_CALENDAR_LOAD_WINDOW_MS = 2_000;

const DoctorCalendarEventPanel = dynamic(
  () =>
    import('../../calendar/DoctorCalendarEventPanel').then((mod) => mod.DoctorCalendarEventPanel),
  { ssr: false },
);

const DoctorCalendarRescheduleDialog = dynamic(
  () =>
    import('../../calendar/DoctorCalendarRescheduleDialog').then(
      (mod) => mod.DoctorCalendarRescheduleDialog,
    ),
  { ssr: false },
);

const ScheduleFullCalendarHost = dynamic(
  () => import('./ScheduleFullCalendarHost').then((mod) => mod.ScheduleFullCalendarHost),
  {
    ssr: false,
    loading: () => <DoctorPanelLoading className="min-h-[28rem]" />,
  },
);

// ---------------------------------------------------------------------------
// ScheduleCalendarTab — главный компонент
// ---------------------------------------------------------------------------

/** Таб «Записи» раздела «Расписание» (v26 ребилд). */
export function ScheduleCalendarTab({
  deepLinkParams,
  onDeepLinkChange,
  initialData,
  isActive,
  initialTimeZone,
  scheduleScopeBootstrap,
  doctorStatisticsEnabled,
  createAppointmentRequestId,
  appointmentsManageOwn = true,
  availabilityManageOwn = true,
}: ScheduleTabProps) {
  const { patientSingularLabel, appointmentAccusative } = useDoctorPatientTerms();
  const bootstrap = isScheduleCalendarBootstrap(initialData) ? initialData : null;
  /** While current key equals SSR key, skip client load (survives Strict Mode remount). */
  const ssrLoadKeyRef = useRef(
    bootstrap
      ? scheduleCalendarLoadKey({
          view: bootstrap.view,
          anchorDate: bootstrap.anchorDate,
          branchId: bootstrap.branchId,
          serviceId: bootstrap.serviceId,
          scope: bootstrap.scheduleScope.scope,
          specialistId: bootstrap.scheduleScope.specialistId,
        })
      : null,
  );
  /** SSR settings stay authoritative — never clear, so Strict Mode remount does not refetch. */
  const settingsSeededRef = useRef(Boolean(bootstrap?.settings));
  const loadGenerationRef = useRef(0);
  const filterCacheRestoredRef = useRef(false);
  const calendarFilterOpenRef = useRef(false);
  const calendarFilterOpenVersionRef = useRef(0);
  const suppressCalendarInteractionUntilRef = useRef(0);
  const suppressCalendarDateClickUntilRef = useRef(0);
  const recentLoadRef = useRef<{ key: string; startedAt: number } | null>(null);
  const createPanelRevealTimerRef = useRef<number | null>(null);
  const handledCreateAppointmentRequestRef = useRef(0);
  const listFeedSeededRef = useRef(Boolean(bootstrap?.appointmentFeed));

  // ─── State ─────────────────────────────────────────────────────────────────
  const [timeZone] = useState(initialTimeZone ?? DEFAULT_APP_DISPLAY_TIMEZONE);
  const [view, setViewState] = useState<CalV26View>(
    () => bootstrap?.view ?? resolveView(deepLinkParams.view),
  );
  const [anchorDate, setAnchorDateState] = useState<string>(
    () => bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const [mobileVisibleDate, setMobileVisibleDateState] = useState<string>(
    () => bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const mobileVisibleDateRef = useRef(mobileVisibleDate);
  const [branchId, setBranchIdState] = useState<string | null>(
    () => bootstrap?.branchId ?? deepLinkParams.location ?? null,
  );
  const [serviceId, setServiceIdState] = useState<string | null>(
    () => bootstrap?.serviceId ?? deepLinkParams.service ?? null,
  );
  const scopeBootstrap = scheduleScopeBootstrap ?? EMPTY_SCHEDULE_SCOPE_BOOTSTRAP;
  const canManageAppointments = appointmentsManageOwn;
  const canManageAvailability = availabilityManageOwn;
  const [scheduleScope, setScheduleScope] = useState<DoctorScheduleScopeState>(
    () =>
      bootstrap?.scheduleScope ??
      resolveDoctorScheduleScopeState(
        scopeBootstrap,
        deepLinkParams.scope,
        deepLinkParams.specialist,
      ),
  );
  // drill-down: where to go back after drill-down day ("from" deep-link)
  const [drillBackView, setDrillBackView] = useState<CalV26View | null>(
    deepLinkParams.from ? (resolveView(deepLinkParams.from) ?? null) : null,
  );
  // Render mode: calendar or list
  const [renderMode, setRenderModeState] = useState<RenderMode>(() =>
    resolveRenderMode(deepLinkParams.render),
  );

  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(() => bootstrap?.calendar ?? null);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<ScheduleKpis | null>(() => bootstrap?.kpis ?? null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showCancelledAppointments, setShowCancelledAppointments] = useState(false);
  const [selectedKpiFilters, setSelectedKpiFilters] = useState<ScheduleKpiFilterKey[]>([]);
  // КПИ-фильтр снимается той же плиткой, которой ставится. Если плиток на странице нет —
  // статистика организации выключена, а в кэше с прошлого раза лежит выбранный фильтр, — человек
  // получил бы урезанное расписание без единой возможности это отменить. Поэтому без плиток
  // фильтры не применяются вовсе: выбор в хранилище остаётся и оживёт вместе со статистикой.
  const showKpi = doctorStatisticsEnabled;
  const activeKpiFilters = showKpi ? selectedKpiFilters : NO_KPI_FILTERS;
  const [filterCacheReady, setFilterCacheReady] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const isWideScheduleLayout = useViewportMinWidth(1280);
  // #227: ref к FullCalendar для вызова unselect() при отмене создания
  const calendarRef = useRef<FullCalendarInstance>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [listAppointments, setListAppointments] = useState<CalendarAppointmentEvent[]>(
    () => bootstrap?.appointmentFeed?.items ?? [],
  );
  const [listTodayRequest, setListTodayRequest] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadingEarlier, setListLoadingEarlier] = useState(false);
  const [listLoadingLater, setListLoadingLater] = useState(false);
  const [listHasEarlier, setListHasEarlier] = useState(true);
  const [listHasLater, setListHasLater] = useState(
    () => bootstrap?.appointmentFeed?.hasLater ?? true,
  );
  const [listPastBoundary, setListPastBoundary] = useState<string | null>(
    () => bootstrap?.appointmentFeed?.pastBoundary ?? null,
  );
  const [listFutureFrom, setListFutureFrom] = useState<string | null>(
    () => bootstrap?.appointmentFeed?.futureFrom ?? null,
  );
  const [listFutureOffset, setListFutureOffset] = useState(
    () => bootstrap?.appointmentFeed?.futureOffset ?? 0,
  );
  const [serverSearchItems, setServerSearchItems] = useState<CalendarAppointmentEvent[]>([]);
  const [serverSearchTotal, setServerSearchTotal] = useState<number | null>(null);
  const [serverSearchHasMore, setServerSearchHasMore] = useState(false);
  const [serverSearchLoading, setServerSearchLoading] = useState(false);
  const [serverSearchQuery, setServerSearchQuery] = useState<string | null>(null);
  const listLoadGenerationRef = useRef(0);
  /** Вид+якорь прошлого запроса ленты: отличает смену периода от перезапроса по смене фильтров. */
  const previousFeedKeyRef = useRef<string | null>(null);
  /** Дата, на которую лента должна встать после перезапроса по фильтрам (null — обычный якорь). */
  const [listScrollTargetDate, setListScrollTargetDate] = useState<string | null>(null);
  const [listRepositionRequest, setListRepositionRequest] = useState(0);
  // R32: время старта/конца, подставляемое в форму создания при выделении области.
  const [createInitialStart, setCreateInitialStart] = useState<string | null>(null);
  // #225: время конца из drag-интервала → используется как начальная длительность в форме создания.
  const [createInitialEnd, setCreateInitialEnd] = useState<string | null>(null);
  const [createInitialBranchId, setCreateInitialBranchId] = useState<string | null>(null);
  const [createInitialServiceId, setCreateInitialServiceId] = useState<string | null>(null);
  const [draftSlot, setDraftSlot] = useState<CalendarDraftSlot | null>(null);
  // CAL-ACTION-01: the grid selection outlives the tap that made it and drives the menu.
  const [gridSelection, setGridSelection] = useState<CalendarGridSelection | null>(null);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [selectionActionError, setSelectionActionError] = useState<string | null>(null);
  const [selectionActionPending, setSelectionActionPending] = useState(false);
  const [openWorkingHoursDialog, setOpenWorkingHoursDialog] =
    useState<OpenWorkingHoursDialogState | null>(null);
  const selectionAnchorRectRef = useRef<{
    x: number;
    y: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const calendarViewportRef = useRef<HTMLDivElement | null>(null);
  /** Guards the programmatic `select()` of a single tap from re-entering `onSelect`. */
  const suppressSelectCallbackRef = useRef(false);
  const [createFormDirty, setCreateFormDirty] = useState(false);
  const lastSelectAtRef = useRef(0);
  const [calendarSettings, setCalendarSettings] = useState<CalendarDoctorSettings>(
    () => bootstrap?.settings ?? DEFAULT_CALENDAR_SETTINGS,
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const calendarFeedRange = useMemo(
    () => visibleRange(view, anchorDate, timeZone),
    [anchorDate, timeZone, view],
  );
  // R34: подтверждение переноса (drag/resize) перед применением.
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const pendingRescheduleRef = useRef<{
    appointment: CalendarAppointmentEvent;
    arg: { revert: () => void };
    newStartAt: string;
    newEndAt: string;
  } | null>(null);
  const [rescheduleComment, setRescheduleComment] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const handleWideLayout = (event: MediaQueryListEvent) => {
      if (event.matches) setFiltersPanelOpen(false);
    };
    mediaQuery.addEventListener('change', handleWideLayout);
    return () => mediaQuery.removeEventListener('change', handleWideLayout);
  }, []);

  // ─── Sync state → deep-link ────────────────────────────────────────────────

  const setView = useCallback(
    (v: CalV26View) => {
      if (v === view) return;
      setCalendarLoading(true);
      setViewState(v);
      onDeepLinkChange('view', v);
    },
    [onDeepLinkChange, view],
  );

  const setAnchorDate = useCallback(
    (d: string) => {
      if (d === anchorDate) return;
      setCalendarLoading(true);
      setAnchorDateState(d);
      onDeepLinkChange('date', d);
    },
    [anchorDate, onDeepLinkChange],
  );

  const setBranchId = useCallback(
    (v: string | null) => {
      setBranchIdState(v);
      onDeepLinkChange('location', v);
    },
    [onDeepLinkChange],
  );

  const setServiceId = useCallback(
    (v: string | null) => {
      setServiceIdState(v);
      onDeepLinkChange('service', v);
    },
    [onDeepLinkChange],
  );

  const changeScheduleScope = useCallback(
    (scope: DoctorScheduleScopeState['scope'], specialistId?: string | null) => {
      const next = resolveDoctorScheduleScopeState(scopeBootstrap, scope, specialistId);
      setScheduleScope(next);
      setData(null);
      setKpis(null);
      setSelected(null);
      setShowCreatePanel(false);
      onDeepLinkChange('scope', next.scope);
      onDeepLinkChange('specialist', next.scope === 'specialist' ? next.specialistId : null);
    },
    [onDeepLinkChange, scopeBootstrap],
  );

  const setRenderMode = useCallback(
    (mode: RenderMode) => {
      setRenderModeState(mode);
      onDeepLinkChange('render', mode);
    },
    [onDeepLinkChange],
  );

  const updateMobileVisibleDate = useCallback((dateKey: string, commit = false) => {
    // Раньше здесь же переписывался текст кнопки периода форматом «месяц год». Владелец 15.09
    // (п.6) заменил формат на границы периода датами, и единственным источником подписи стал
    // `periodNavLabelText` при обычной перерисовке. Все вызовы этой функции и так меняют
    // `anchorDate`/`view`, то есть перерисовка следует сразу же; писать сюда второй, уже неверный
    // формат было бы прямым источником расхождения.
    mobileVisibleDateRef.current = dateKey;
    if (commit) {
      setMobileVisibleDateState((current) => (current === dateKey ? current : dateKey));
    }
  }, []);

  useEffect(() => {
    if (!isActive || !isMobileViewport || view !== 'weekgrid') return;
    queueMicrotask(() => {
      setCalendarLoading(true);
      setViewState('3days');
    });
  }, [isActive, isMobileViewport, view]);

  // ─── Drill-down day ────────────────────────────────────────────────────────

  const drillDownDay = useCallback(
    (dateKey: string) => {
      if (view === 'month') {
        setDrillBackView(null);
        onDeepLinkChange('from', null);
        updateMobileVisibleDate(dateKey, true);
        setView('3days');
        setAnchorDate(dateKey);
        return;
      }

      // Remember current view for Назад
      const backView = view === 'day' ? (drillBackView ?? '3days') : view;
      setDrillBackView(backView);
      onDeepLinkChange('from', backView);
      setView('day');
      setAnchorDate(dateKey);
    },
    [view, drillBackView, onDeepLinkChange, setView, setAnchorDate, updateMobileVisibleDate],
  );

  const drillBack = useCallback(() => {
    const back = drillBackView ?? '3days';
    setDrillBackView(null);
    onDeepLinkChange('from', null);
    setView(back);
  }, [drillBackView, onDeepLinkChange, setView]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadFeed = useCallback(
    (overrideView?: CalV26View, overrideAnchor?: string, generation?: number) => {
      const v = overrideView ?? view;
      const anchor = overrideAnchor ?? anchorDate;
      const gen = generation ?? ++loadGenerationRef.current;

      startTransition(async () => {
        try {
          const range = visibleRange(v, anchor, timeZone);
          const from = range.from;
          const to = range.to;

          // Map v26 view to API view param
          const apiView =
            v === '3days' ? '3days' : v === 'weekgrid' ? 'week' : v === 'month' ? 'month' : 'day';

          const qs = buildQuery({
            view: apiView,
            date: anchor,
            from,
            to,
            branchId,
            serviceId,
            ...doctorScheduleScopeQuery(scheduleScope),
          });
          const res = await fetch(`${API_BASE}/calendar?${qs}`);
          const raw = await res.text();
          if (gen !== loadGenerationRef.current) return;
          if (!raw.trim()) {
            setError(res.ok ? 'load_failed' : `load_failed_${res.status}`);
            return;
          }
          let json: CalendarResponse;
          try {
            json = JSON.parse(raw) as CalendarResponse;
          } catch {
            setError('load_failed');
            return;
          }
          if (gen !== loadGenerationRef.current) return;
          if (!res.ok || !json.ok) {
            setError(json.error ?? 'load_failed');
            return;
          }
          setData(json);
          setSelected((current) => {
            if (!current) return current;
            return (
              json.events.find(
                (event): event is CalendarAppointmentEvent =>
                  event.kind === 'appointment' && event.id === current.id,
              ) ?? current
            );
          });
          setError(null);
          // Do not write branchId/serviceId from feed into load-key state — that retriggers
          // load() in single-branch clinics. Create-form defaults resolve from filters on open.
        } catch {
          if (gen !== loadGenerationRef.current) return;
          setError('network_error');
        } finally {
          if (gen === loadGenerationRef.current) setCalendarLoading(false);
        }
      });
    },
    [view, anchorDate, branchId, serviceId, timeZone, scheduleScope],
  );

  // Отменённые нужны серверу только по одной причине — их попросили показать: переключателем
  // «показывать отмены» или КПИ-фильтром «Отмены». Зависимость именно от этого булева, а не от
  // всего списка выбранных КПИ: список меняет тождество на каждом нажатии плитки, и лента записей
  // перезапрашивалась бы двумя запросами даже там, где фильтр отрабатывает на клиенте.
  const includeCancelledAppointments =
    showCancelledAppointments || activeKpiFilters.includes('cancellationsInPeriod');
  const fetchAppointmentFeedPage = useCallback(
    async (params: {
      from?: string;
      to?: string;
      q?: string;
      order?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }): Promise<AppointmentFeedResponse> => {
      const response = await fetch(
        `${APPOINTMENT_FEED_API}?${buildQuery({
          from: params.from,
          to: params.to,
          q: params.q,
          order: params.order,
          includeCancelled: String(includeCancelledAppointments),
          limit: String(params.limit ?? APPOINTMENT_FEED_PAGE_SIZE),
          offset: String(params.offset ?? 0),
          branchId,
          serviceId,
          ...doctorScheduleScopeQuery(scheduleScope),
        })}`,
      );
      const json = (await response.json()) as AppointmentFeedResponse;
      if (!response.ok || !json.ok) throw new Error(json.error ?? 'appointment_feed_load_failed');
      return json;
    },
    [branchId, includeCancelledAppointments, scheduleScope, serviceId],
  );

  /**
   * Владелец 15.09 (п.1): «после сброса или просто изменения фильтров календаря, в режиме списка
   * происходит сброс периода и переход к началу года или какой то произвольной дате в прошлом.
   * Исправить, должно оставаться там же где было».
   *
   * Причина: смена фильтра меняет тождество `fetchAppointmentFeedPage`, а с ним и этой функции —
   * лента перезапрашивается целиком и ВЕСЬ массив записей подменяется свежим окном вокруг
   * `anchorDate`. Всё, что человек долистал бесконечной прокруткой, при этом пропадает, высота
   * ленты схлопывается, а браузер оставляет прежний `scrollTop` — он и утыкается в начало
   * подгруженной истории, то есть «куда-то в прошлое».
   *
   * Лечение: если перезапрос вызван ТОЛЬКО сменой фильтров (вид и якорь те же), окно тянем вокруг
   * даты, которая сейчас на экране, и просим ленту заново встать на неё (`repositionRequest`).
   */
  const loadInitialAppointmentFeed = useCallback(async () => {
    const generation = ++listLoadGenerationRef.current;
    const feedKey = `${view}\u0000${anchorDate}`;
    const isFilterOnlyReload = previousFeedKeyRef.current === feedKey;
    previousFeedKeyRef.current = feedKey;
    const preservedDate = isFilterOnlyReload ? listVisibleDateRef.current : null;
    const rawAnchor = DateTime.fromISO(preservedDate ?? anchorDate, { zone: timeZone });
    const target =
      view === 'month' && !preservedDate ? rawAnchor.startOf('month') : rawAnchor.startOf('day');
    const historyStart = target.minus({ months: APPOINTMENT_FEED_HISTORY_MONTHS }).startOf('month');
    const targetIso = target.toUTC().toISO();
    const historyStartIso = historyStart.toUTC().toISO();
    if (!targetIso || !historyStartIso) return;

    setListLoading(true);
    setServerSearchQuery(null);
    setServerSearchItems([]);
    setServerSearchTotal(null);
    try {
      const [historyPage, futurePage] = await Promise.all([
        fetchAppointmentFeedPage({
          from: historyStartIso,
          to: target.minus({ milliseconds: 1 }).toUTC().toISO() ?? undefined,
          order: 'desc',
          limit: 200,
        }),
        fetchAppointmentFeedPage({ from: targetIso, order: 'asc' }),
      ]);
      if (generation !== listLoadGenerationRef.current) return;
      const historyItems = historyPage.items ?? [];
      const futureItems = futurePage.items ?? [];
      setListAppointments(mergeAppointmentPages(historyItems, futureItems));
      setListPastBoundary(historyStartIso);
      setListFutureFrom(targetIso);
      setListFutureOffset(futureItems.length);
      setListHasEarlier(true);
      setListHasLater(Boolean(futurePage.hasMore));
      setError(null);
      // Лента встала на новый массив — вернуть её туда, где человек был. Без этого эффект
      // позиционирования не проснётся: `anchorDate` не менялся, и его собственный сторож
      // (`positionedAnchorRef`) считает работу уже сделанной.
      setListScrollTargetDate(preservedDate);
      setListRepositionRequest((current) => current + 1);
    } catch {
      if (generation === listLoadGenerationRef.current) setError('network_error');
    } finally {
      if (generation === listLoadGenerationRef.current) setListLoading(false);
    }
  }, [anchorDate, fetchAppointmentFeedPage, timeZone, view]);

  const loadEarlierAppointments = useCallback(async () => {
    if (!listPastBoundary || listLoadingEarlier || !listHasEarlier) return;
    const boundary = DateTime.fromISO(listPastBoundary, { setZone: true });
    const previousBoundary = boundary
      .minus({ months: APPOINTMENT_FEED_HISTORY_MONTHS })
      .startOf('month');
    const from = previousBoundary.toUTC().toISO();
    const to = boundary.minus({ milliseconds: 1 }).toUTC().toISO();
    if (!from || !to) return;
    setListLoadingEarlier(true);
    try {
      const page = await fetchAppointmentFeedPage({ from, to, order: 'desc', limit: 200 });
      const items = page.items ?? [];
      setListAppointments((current) => mergeAppointmentPages(items, current));
      setListPastBoundary(from);
      setListHasEarlier(items.length > 0);
    } catch {
      setError('network_error');
    } finally {
      setListLoadingEarlier(false);
    }
  }, [fetchAppointmentFeedPage, listHasEarlier, listLoadingEarlier, listPastBoundary]);

  const loadLaterAppointments = useCallback(async () => {
    if (!listFutureFrom || listLoadingLater || !listHasLater) return;
    setListLoadingLater(true);
    try {
      const page = await fetchAppointmentFeedPage({
        from: listFutureFrom,
        order: 'asc',
        offset: listFutureOffset,
      });
      const items = page.items ?? [];
      setListAppointments((current) => mergeAppointmentPages(current, items));
      setListFutureOffset((current) => current + items.length);
      setListHasLater(Boolean(page.hasMore));
    } catch {
      setError('network_error');
    } finally {
      setListLoadingLater(false);
    }
  }, [fetchAppointmentFeedPage, listFutureFrom, listFutureOffset, listHasLater, listLoadingLater]);

  const searchAllAppointments = useCallback(async () => {
    const query = searchQuery.trim();
    if (query.length < 3 || serverSearchLoading) return;
    setServerSearchLoading(true);
    try {
      const page = await fetchAppointmentFeedPage({ q: query, order: 'asc', limit: 200 });
      setServerSearchQuery(query);
      setServerSearchItems(page.items ?? []);
      setServerSearchTotal(page.total ?? 0);
      setServerSearchHasMore(Boolean(page.hasMore));
      setError(null);
    } catch {
      setError('network_error');
    } finally {
      setServerSearchLoading(false);
    }
  }, [fetchAppointmentFeedPage, searchQuery, serverSearchLoading]);

  const loadMoreSearchResults = useCallback(async () => {
    if (!serverSearchQuery || serverSearchLoading || !serverSearchHasMore) return;
    setServerSearchLoading(true);
    try {
      const page = await fetchAppointmentFeedPage({
        q: serverSearchQuery,
        order: 'asc',
        limit: 200,
        offset: serverSearchItems.length,
      });
      setServerSearchItems((current) => mergeAppointmentPages(current, page.items ?? []));
      setServerSearchHasMore(Boolean(page.hasMore));
    } catch {
      setError('network_error');
    } finally {
      setServerSearchLoading(false);
    }
  }, [
    fetchAppointmentFeedPage,
    serverSearchHasMore,
    serverSearchItems.length,
    serverSearchLoading,
    serverSearchQuery,
  ]);

  useEffect(() => {
    if (renderMode !== 'list') {
      // Выход из ленты обнуляет её «где я был». Иначе при следующем возврате в список перезапрос
      // с тем же видом и якорем выглядел бы как смена фильтра, и лента встала бы на прокрутку
      // прошлого сеанса вместо сегодняшнего дня — правило владельца 14.09 «переключившись из
      // месяца в список, вижу СЕГОДНЯ» держится именно на этом обнулении.
      previousFeedKeyRef.current = null;
      listVisibleDateRef.current = null;
      setListScrollTargetDate(null);
      return;
    }
    if (listFeedSeededRef.current) {
      listFeedSeededRef.current = false;
      return;
    }
    void loadInitialAppointmentFeed();
  }, [loadInitialAppointmentFeed, renderMode]);

  const loadKpis = useCallback(
    (v: CalV26View, anchor: string, generation?: number) => {
      if (!doctorStatisticsEnabled) return;

      const gen = generation ?? loadGenerationRef.current;
      const { from, to } = visibleRange(v, anchor, timeZone);
      setKpisLoading(true);

      void fetch(
        `${KPIS_API}?${buildQuery({
          from,
          to,
          branchId,
          serviceId,
          ...doctorScheduleScopeQuery(scheduleScope),
        })}`,
      )
        .then((res) => res.json())
        .then((json: { ok: boolean; kpis: ScheduleKpis }) => {
          if (gen !== loadGenerationRef.current) return;
          if (json.ok && json.kpis) setKpis(json.kpis);
        })
        .catch(() => {
          // Деградация: показываем последние известные KPI
        })
        .finally(() => {
          if (gen === loadGenerationRef.current) {
            setKpisLoading(false);
          }
        });
    },
    [branchId, doctorStatisticsEnabled, serviceId, timeZone, scheduleScope],
  );

  // Parallel load: feed + kpis
  const load = useCallback(() => {
    const requestKey = [
      view,
      anchorDate,
      branchId ?? '',
      serviceId ?? '',
      scheduleScope.scope,
      scheduleScope.specialistId ?? '',
      renderMode,
      calendarFeedRange.from,
      calendarFeedRange.to,
    ].join('\0');
    const startedAt = Date.now();
    const recentLoad = recentLoadRef.current;
    if (
      recentLoad?.key === requestKey &&
      startedAt - recentLoad.startedAt < DUPLICATE_CALENDAR_LOAD_WINDOW_MS
    ) {
      return;
    }
    recentLoadRef.current = { key: requestKey, startedAt };
    const generation = ++loadGenerationRef.current;
    if (renderMode === 'calendar') {
      loadFeed(undefined, undefined, generation);
    }
    // Владелец 15.09: «я поэтому и сказал убрать цифры и НЕ СЧИТАТЬ — просто фильтровать». В ленте
    // числа не показываются (`valuesHidden`), а отбор по плиткам целиком решает по полям самой
    // записи — `kpis` ему не нужны вовсе с тех пор, как признак первого посещения приехал на
    // записи (`isFirstVisit`) вместо списка `firstVisitIds` за окно. Поэтому запрос КПИ в режиме
    // списка не уходит — включая тридцатисекундный опрос ниже, который до этой правки гонял счёт
    // по якорному периоду ради чисел, которых на экране нет. Возврат в календарь перезапускает
    // `load` (в зависимостях есть `renderMode`) и числа считаются снова.
    if (renderMode !== 'list') {
      loadKpis(view, anchorDate, generation);
    }
  }, [
    anchorDate,
    branchId,
    calendarFeedRange.from,
    calendarFeedRange.to,
    loadFeed,
    loadKpis,
    renderMode,
    scheduleScope.scope,
    scheduleScope.specialistId,
    serviceId,
    view,
  ]);

  useEffect(() => {
    if (settingsSeededRef.current) {
      return;
    }
    let cancelled = false;
    void fetch('/api/doctor/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (json: { ok?: boolean; settings?: Array<{ key: string; valueJson: unknown }> } | null) => {
          if (cancelled || !json?.ok || !json.settings) return;
          setCalendarSettings(parseCalendarDoctorSettings(json.settings));
        },
      )
      .catch(() => {
        // Non-critical: keep built-in defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const calendarLoadKey = scheduleCalendarLoadKey({
    view,
    anchorDate,
    branchId,
    serviceId,
    scope: scheduleScope.scope,
    specialistId: scheduleScope.specialistId,
  });

  useEffect(() => {
    if (ssrLoadKeyRef.current !== null && calendarLoadKey === ssrLoadKeyRef.current) {
      return;
    }
    ssrLoadKeyRef.current = null;
    queueMicrotask(() => load());
  }, [calendarLoadKey, load]);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, isActive]);

  useEffect(() => {
    const handleRefresh = () => load();
    window.addEventListener(DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT, handleRefresh);
    };
  }, [load]);

  // ─── Period navigation ─────────────────────────────────────────────────────

  function shiftAnchor(delta: number) {
    const dt = DateTime.fromISO(anchorDate, { zone: timeZone });
    let next: string | null;
    if (view === 'month') {
      next = dt.plus({ months: delta > 0 ? 1 : -1 }).toISODate();
    } else if (view === 'weekgrid') {
      next = dt.plus({ days: delta * 7 }).toISODate();
    } else if (view === '3days') {
      next = dt.plus({ days: delta * 3 }).toISODate();
    } else {
      // day
      next = dt.plus({ days: delta }).toISODate();
    }
    if (next) {
      if (isMobileViewport) updateMobileVisibleDate(next, true);
      setAnchorDate(next);
    }
  }

  function goToday() {
    const today = DateTime.now().setZone(timeZone).toISODate();
    if (!today) return;
    updateMobileVisibleDate(today, true);
    setAnchorDate(today);
    if (renderMode === 'list') setListTodayRequest((current) => current + 1);
  }

  function jumpToDate(date: Date) {
    const dateKey = DateTime.fromObject(
      { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
      { zone: timeZone },
    ).toISODate();
    if (!dateKey) return;
    updateMobileVisibleDate(dateKey, true);
    setAnchorDate(dateKey);
    setDatePickerOpen(false);
  }

  // ─── Calendar events ───────────────────────────────────────────────────────

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  useEffect(() => {
    if (!data || filterCacheRestoredRef.current) return;
    const cached = readCachedScheduleFilters();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || filterCacheRestoredRef.current) return;
      filterCacheRestoredRef.current = true;
      if (cached) {
        if (!deepLinkParams.location) {
          setBranchIdState(
            cached.branchId && filters.branches.some((branch) => branch.id === cached.branchId)
              ? cached.branchId
              : null,
          );
        }
        if (!deepLinkParams.service) {
          setServiceIdState(
            cached.serviceId && filters.services.some((service) => service.id === cached.serviceId)
              ? cached.serviceId
              : null,
          );
        }
        if (!deepLinkParams.scope && !deepLinkParams.specialist) {
          const cachedScope = resolveDoctorScheduleScopeState(
            scopeBootstrap,
            cached.scope,
            cached.specialistId,
          );
          if (
            cachedScope.scope !== scheduleScope.scope ||
            cachedScope.specialistId !== scheduleScope.specialistId
          ) {
            setScheduleScope(cachedScope);
            setData(null);
            setKpis(null);
          }
        }
        setShowCancelledAppointments(cached.showCancelledAppointments);
        setSelectedKpiFilters(cached.kpiFilters);
      }
      setFilterCacheReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data, deepLinkParams, filters.branches, filters.services, scheduleScope, scopeBootstrap]);

  useEffect(() => {
    if (!filterCacheReady) return;
    writeCachedScheduleFilters({
      branchId,
      serviceId,
      scope: scheduleScope.scope,
      specialistId: scheduleScope.specialistId,
      showCancelledAppointments,
      kpiFilters: selectedKpiFilters,
    });
  }, [
    branchId,
    filterCacheReady,
    scheduleScope,
    selectedKpiFilters,
    serviceId,
    showCancelledAppointments,
  ]);

  const defaultCreateSpecialistId =
    calendarSettings.defaultSpecialistId &&
    filters.specialists.some((specialist) => specialist.id === calendarSettings.defaultSpecialistId)
      ? calendarSettings.defaultSpecialistId
      : null;

  const activeFilters = useMemo(
    () => ({
      specialistId: data?.resolvedScope.specialistId ?? scheduleScope.specialistId,
      branchId,
      roomId: null,
      serviceId,
    }),
    [branchId, data?.resolvedScope.specialistId, scheduleScope.specialistId, serviceId],
  );

  /**
   * Подпись «за какой период посчитаны плитки» — ровно тот диапазон, который уходит в КПИ.
   * `loadKpis` строит `from/to` по state `timeZone` (не по `data?.timeZone`) — подпись обязана
   * читать тот же источник пояса, иначе после смены пояса устройства она способна описывать не
   * тот интервал, по которому реально посчитаны числа (аудит 14.09, Э3 FAIL).
   */
  const kpiPeriod = useMemo(
    () => kpiPeriodLabel(view, anchorDate, timeZone),
    [anchorDate, timeZone, view],
  );

  /**
   * День, на который встаёт список при открытии. Владелец 14.09: переключившись на телефоне из
   * месяца в список, он должен увидеть СЕГОДНЯ, а не первое число месяца. Поэтому сегодняшний день
   * побеждает, когда он попадает в видимый период; осознанный уход в другой месяц при этом не
   * теряется — там сегодняшнего дня в периоде нет, и якорем остаётся его начало. Дальше список сам
   * встаёт на ближайший день С ЗАПИСЯМИ (`dateKey >= anchorDate`), то есть правило «сегодня, либо
   * день следующей записи» выполняется без отдельной ветки.
   */
  const listAnchorDate = useMemo(() => {
    const zone = data?.timeZone ?? timeZone;
    const range = visibleRange(view, anchorDate, zone);
    // Начало ВИДИМОГО периода для любого вида, не только `month` — иначе `weekgrid` на неделе,
    // отличной от anchor-недели, ставит якорь на день недели из `anchorDate` вместо понедельника
    // выбранной недели (аудит 14.09, Э1 FAIL).
    const periodStart = DateTime.fromISO(range.from, { zone }).toISODate() ?? anchorDate;
    const todayKey = DateTime.now().setZone(zone).toISODate();
    const fromKey = periodStart;
    // `to` в модели периода — начало следующего дня, то есть граница не включается.
    const toKey = DateTime.fromISO(range.to, { zone }).toISODate();
    if (!todayKey || !fromKey || !toKey) return periodStart;
    return todayKey >= fromKey && todayKey < toKey ? todayKey : periodStart;
  }, [anchorDate, data?.timeZone, timeZone, view]);
  const scheduleSpecialistOptions = useMemo(
    () =>
      scopeBootstrap.specialists.map((specialist) => ({
        id: specialist.id,
        label: specialist.displayLabel,
      })),
    [scopeBootstrap.specialists],
  );
  const selectedScheduleSpecialistId =
    scheduleScope.scope === 'clinic' ? null : scheduleScope.specialistId;
  const defaultScheduleScope = resolveDoctorScheduleScopeState(scopeBootstrap, null, null);
  const hasActiveScheduleFilters =
    branchId !== null ||
    serviceId !== null ||
    showCancelledAppointments ||
    activeKpiFilters.length > 0 ||
    scheduleScope.scope !== defaultScheduleScope.scope ||
    scheduleScope.specialistId !== defaultScheduleScope.specialistId;
  const handleCalendarFilterOpenChange = useCallback((open: boolean) => {
    const version = ++calendarFilterOpenVersionRef.current;
    if (open) {
      calendarFilterOpenRef.current = true;
      return;
    }
    queueMicrotask(() => {
      if (calendarFilterOpenVersionRef.current === version) {
        calendarFilterOpenRef.current = false;
      }
    });
  }, []);

  /**
   * Контролы фильтров идут одной колонкой; шаг между ними задаёт вызывающий. Владелец 15.09: «в
   * фильтрах большие расстояния — можно чуть меньше» — 8px между контролами высотой 32px сжаты до
   * 6px. Отступ строк от края блока владелец трогать не велел («ну хотя оставь»), поэтому padding
   * карточки остался канонический.
   */
  const renderScheduleFilters = (className: string, controlClassName?: string) => (
    <div className={className}>
      <DoctorCalendarToolbarFilter
        noneLabel="Все филиалы"
        options={filters.branches}
        value={branchId}
        onChange={setBranchId}
        onOpenChange={handleCalendarFilterOpenChange}
        className={controlClassName}
      />
      {scopeBootstrap.canManageAllSpecialists && scheduleSpecialistOptions.length > 1 ? (
        <DoctorCalendarToolbarFilter
          noneLabel="Все сотрудники"
          options={scheduleSpecialistOptions}
          value={selectedScheduleSpecialistId}
          onChange={(specialistId) =>
            specialistId
              ? changeScheduleScope('specialist', specialistId)
              : changeScheduleScope('clinic')
          }
          onOpenChange={handleCalendarFilterOpenChange}
          className={controlClassName}
        />
      ) : null}
      <DoctorCalendarToolbarFilter
        noneLabel="Все услуги"
        options={filters.services}
        value={serviceId}
        onChange={setServiceId}
        onOpenChange={handleCalendarFilterOpenChange}
        className={controlClassName}
      />
      {/* Владелец 15.09: «флажок показывать отмены расположить рядом с фразой а не в другом конце
          экрана» — переключатель прижат к подписи, а не разведён с ней по краям строки. */}
      <label className="flex h-8 w-full cursor-pointer items-center gap-2 px-1 text-sm text-foreground">
        <Switch
          checked={showCancelledAppointments}
          onCheckedChange={setShowCancelledAppointments}
          aria-label="Показывать отмены"
        />
        <span>Показывать отмены</span>
      </label>
      {renderScheduleSearchControls()}
    </div>
  );

  const currentTimeZone = data?.timeZone ?? timeZone;

  /**
   * Подпись периода живёт в двух-трёх экземплярах сразу (мобильный тулбар, панель в `<aside>`,
   * панель в модалке), а в режиме списка обязана обновляться НА КАЖДОЙ ПРОКРУТКЕ (владелец 15.09,
   * п.7). Гонять ради этого React-состояние нельзя: перерисовка ленты в сотни строк на каждом
   * шаге прокрутки — это заметный рывок. Поэтому кнопки регистрируют свои DOM-узлы здесь, и при
   * прокрутке текст переписывается напрямую (`textContent`), мимо React. В состояние дата
   * переезжает только когда прокрутка
   * остановилась, чтобы следующая штатная перерисовка не вернула устаревшую подпись.
   */
  const periodLabelNodesRef = useRef(new Map<string, HTMLButtonElement>());
  const periodLabelSettersRef = useRef(
    new Map<string, (node: HTMLButtonElement | null) => void>(),
  );
  const registerPeriodLabelNode = useCallback((key: string) => {
    const cached = periodLabelSettersRef.current.get(key);
    if (cached) return cached;
    const setter = (node: HTMLButtonElement | null) => {
      if (node) periodLabelNodesRef.current.set(key, node);
      else periodLabelNodesRef.current.delete(key);
    };
    periodLabelSettersRef.current.set(key, setter);
    return setter;
  }, []);

  const [listVisibleDate, setListVisibleDate] = useState<string | null>(null);
  const listVisibleDateRef = useRef<string | null>(null);
  const listVisibleCommitTimerRef = useRef<number | null>(null);

  const handleListVisibleDateChange = useCallback(
    (dateKey: string) => {
      if (listVisibleDateRef.current === dateKey) return;
      listVisibleDateRef.current = dateKey;
      const text = listPeriodNavLabel(dateKey, currentTimeZone);
      for (const node of periodLabelNodesRef.current.values()) node.textContent = text;
      if (listVisibleCommitTimerRef.current !== null) {
        window.clearTimeout(listVisibleCommitTimerRef.current);
      }
      listVisibleCommitTimerRef.current = window.setTimeout(() => {
        listVisibleCommitTimerRef.current = null;
        setListVisibleDate(dateKey);
      }, 200);
    },
    [currentTimeZone],
  );

  useEffect(
    () => () => {
      if (listVisibleCommitTimerRef.current !== null) {
        window.clearTimeout(listVisibleCommitTimerRef.current);
      }
    },
    [],
  );

  const scheduleViewOptions: Array<{ key: CalV26View | 'list'; label: string }> = [
    { key: '3days', label: '3 дня' },
    ...(isMobileViewport ? [] : [{ key: 'weekgrid' as const, label: 'Неделя' }]),
    { key: 'month', label: 'Месяц' },
    { key: 'list', label: 'Список' },
  ];

  /**
   * Владелец 14.09: «в десктопном и планшетном виде надо верхнюю панель перенести в правый блок
   * фильтров: сверху блок „Вид“ … ниже блок „Период“ … ниже уже идут фильтры». Блок стоит над
   * `renderScheduleFilters` во ВСЕХ трёх местах, где живёт панель: постоянно открытом `<aside>`
   * (xl+) и модалке фильтров — и на планшете, и на мобильном (владелец 15.09: «в модалке
   * мобильного пусть будет так же две верхние строки — выбор периода на экране и режима»).
   *
   * Владелец 15.09: «слей блоки период и дата в один» — выбор длины периода (3 дня/неделя/месяц/
   * список) и выбор самой даты были двумя отдельными карточками подряд, хотя описывают одно и то
   * же: какой отрезок времени показан. Теперь это одна карточка в две строки; рамка, заголовок и
   * межблочный зазор экономятся в пользу фильтров ниже.
   *
   * «Список» — один из вариантов длины периода, отдельной иконки календаря нет. «Неделя» на
   * мобильном не предлагается (владелец 15.09: «только без недели») — недельная сетка там всё
   * равно не живёт, отдельный эффект разворачивает `weekgrid` обратно в `3days` на узком экране.
   *
   * Заголовок блока скрыт на десктопе (`xl:hidden`, владелец 15.09) — в постоянно открытой
   * панели он лишний шум; в модалке (планшет и мобильный) остаётся: там блоки идут подряд без
   * контекста страницы.
   */
  const renderSchedulePeriodBlock = (slotKey: 'aside' | 'modal') => (
    <section className={doctorSectionCardClass}>
      <h2 className={cn(doctorSectionTitleClass, 'xl:hidden')}>Период</h2>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Режим отображения">
        {scheduleViewOptions.map(({ key, label }) => {
          const active =
            key === 'list' ? renderMode === 'list' : renderMode === 'calendar' && view === key;
          return (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              className={active ? undefined : INACTIVE_TOOLBAR_BUTTON_CLASS}
              onClick={() => {
                setFiltersPanelOpen(false);
                if (view === 'day') {
                  setDrillBackView(null);
                  onDeepLinkChange('from', null);
                }
                if (key === 'list') {
                  setRenderMode('list');
                  return;
                }
                setRenderMode('calendar');
                setView(key);
              }}
              data-testid={key === 'list' ? 'render-btn-list' : `view-btn-${key}`}
            >
              {label}
            </Button>
          );
        })}
      </div>
      {/* Drill-down «День»: показываем если сейчас day (клик по дню в месяце) */}
      {view === 'day' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(INACTIVE_TOOLBAR_BUTTON_CLASS, 'self-start')}
          onClick={() => {
            setFiltersPanelOpen(false);
            drillBack();
          }}
          data-testid="drill-back-btn"
        >
          ← Назад
        </Button>
      ) : null}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={INACTIVE_TOOLBAR_BUTTON_CLASS}
          onClick={() => {
            setFiltersPanelOpen(false);
            goToday();
          }}
          data-testid="period-today"
        >
          Сегодня
        </Button>
        <DoctorSchedulePeriodNav
          label={periodNavLabelText}
          labelRef={registerPeriodLabelNode(slotKey)}
          onPrev={() => {
            setFiltersPanelOpen(false);
            shiftAnchor(-1);
          }}
          onNext={() => {
            setFiltersPanelOpen(false);
            shiftAnchor(1);
          }}
          onLabelClick={() => {
            setFiltersPanelOpen(false);
            // Тот же приём, что и на мобильном label-click: перед открытием общей модалки
            // выбора даты подтягиваем `mobileVisibleDate` к текущему `anchorDate` — иначе
            // DayPicker (использует `mobileVisibleDate`, не обновляемый стрелками вне
            // мобильного вьюпорта) откроется на устаревшем месяце.
            updateMobileVisibleDate(anchorDate, true);
            setDatePickerOpen(true);
          }}
          prevAriaLabel="Предыдущий период"
          nextAriaLabel="Следующий период"
          labelAriaLabel="Перейти к дате"
          prevTestId="period-prev"
          nextTestId="period-next"
          labelTestId="period-label"
        />
      </div>
    </section>
  );

  /**
   * Поиск по записям. Владелец 15.09: «поиск перенести под блок с выбором филиала/услуги/отмен —
   * и в десктопе/планшете и в мобиле». Сначала это была отдельная карточка сразу под фильтрами,
   * теперь — «поиск влей в фильтры» (владелец 15.09): строка поиска стоит последним контролом
   * ВНУТРИ блока фильтров, рядом с филиалом/сотрудником/услугой/отменами. Она такой же фильтр
   * выдачи, как они, и собственная рамка с заголовком делала из неё отдельную сущность.
   * С мобильного верхнего тулбара строка убрана тем же решением — на телефоне она живёт здесь же,
   * в модалке фильтров.
   */
  const renderScheduleSearchControls = () => (
    <>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Поиск записей…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="h-8 pl-8 text-sm"
          aria-label="Поиск записей"
        />
      </div>
      {renderMode === 'list' && searchQuery.trim() ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <DoctorResultCount
              data-testid="search-count"
              label="Найдено"
              value={serverSearchTotal ?? visibleListAppointments.length}
            />
            {/*
              Владелец 15.09: «в режиме списка, поскольку мы подгружаем так же историю, писать не
              только сколько найдено но и с какого периода». У ленты нет конца периода — есть
              граница, докуда её дотянули, поэтому вместо диапазона пишем одну дату: самую раннюю
              из найденного.
            */}
            {searchResultsFromLabel ? (
              <span data-testid="search-from">с {searchResultsFromLabel}</span>
            ) : null}
          </div>
          {searchQuery.trim().length >= 3 && !serverSearchQuery ? (
            <button
              type="button"
              className="self-start text-primary underline-offset-2 hover:underline"
              onClick={() => void searchAllAppointments()}
              disabled={serverSearchLoading}
            >
              {serverSearchLoading ? 'Поиск…' : 'Искать более ранние'}
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const kpiFilterPredicate = useMemo<
    ((appointment: CalendarAppointmentEvent) => boolean) | null
  >(() => {
    if (activeKpiFilters.length === 0) return null;
    const predicates: Record<
      ScheduleKpiFilterKey,
      (appointment: CalendarAppointmentEvent) => boolean
    > = {
      cancellationsInPeriod: (appointment) => isCancelledAppointmentStatus(appointment.status),
      // Владелец 15.09: «первичные — это человек впервые пришёл, а не первая за период». Признак
      // приходит НА САМОЙ записи (`isFirstVisit`, см. `modules/booking-calendar/types.ts`), а не
      // списком id за окно КПИ, как было до 15.09: список ограничен `visibleRange`, поэтому в
      // ленте, которая тянет историю месяцами, отбор резал её до якорного периода вместо отбора
      // первичных. Теперь этот предикат такой же, как остальные четыре, — читает поле записи.
      firstVisitInPeriod: (appointment) => appointment.isFirstVisit === true,
      bySubscriptionInPeriod: (appointment) =>
        Boolean(appointment.packageUsageRef || appointment.packageTitle),
      futureInPeriod: (appointment) =>
        parseFeedInstant(appointment.startAt, currentTimeZone) >= DateTime.now(),
      reschedulesInPeriod: (appointment) =>
        !isCancelledAppointmentStatus(appointment.status) && appointment.rescheduleCount > 0,
    };
    return (appointment) => activeKpiFilters.every((key) => predicates[key](appointment));
  }, [activeKpiFilters, currentTimeZone]);

  const displayableCalendarEvents = useMemo(
    () =>
      (data?.events ?? []).filter(
        (event) =>
          event.kind !== 'appointment' ||
          (includeCancelledAppointments || !isCancelledAppointmentStatus(event.status)) &&
            (!kpiFilterPredicate || kpiFilterPredicate(event)),
      ),
    [data?.events, includeCancelledAppointments, kpiFilterPredicate],
  );

  /**
   * Поиск сужает КАЛЕНДАРНУЮ СЕТКУ, а не только ленту списка. Владелец 15.09: «в режиме календаря
   * поиск сейчас не работает и записи в видимом окне не фильтрует (ни в 3 дня/неделе, ни в месяце)»
   * — до этой правки такой мемо в файле был, но его никто не использовал: сетку кормит
   * `calendarEvents`, собранный напрямую из `displayableCalendarEvents`, поэтому строка поиска
   * молча ни на что не влияла.
   *
   * Прячем ТОЛЬКО записи, не подходящие под поиск (решение владельца 15.09). Рабочие часы,
   * перерывы, свободные слоты и блокировки остаются на месте: они разметка дня, а не результат
   * поиска, и без них сетка схлопнулась бы в пустое поле.
   */
  const searchedCalendarEvents = useMemo<CalendarEvent[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ru');
    if (!query) return displayableCalendarEvents;
    return displayableCalendarEvents.filter((event) => {
      if (event.kind !== 'appointment') return true;
      return [event.patientName, event.patientPhone, event.serviceTitle, event.branchTitle].some(
        (value) => value?.toLocaleLowerCase('ru').includes(query),
      );
    });
  }, [displayableCalendarEvents, searchQuery]);

  const workingBounds = data?.workingBounds;
  const calendarScrollTime = deriveCalendarInitialScrollTime(
    workingBounds,
    displayableCalendarEvents,
    currentTimeZone,
  );
  // The full day stays reachable inside the calendar scroll area. On mount the
  // viewport starts at actual working hours (or an earlier appointment), not midnight.
  const slotMinTime = '00:00:00';
  const slotMaxTime = '24:00:00';
  const loMinute = 0;
  const hiMinute = 24 * 60;

  const findWorkingBranchIdForStart = useCallback(
    (startLocal: string): string | null => {
      const start = DateTime.fromISO(startLocal, { zone: currentTimeZone });
      if (!start.isValid) return null;
      const startMs = start.toMillis();
      const event = (data?.events ?? []).find((e) => {
        if (e.kind !== 'working' || !e.branchId) return false;
        const from = parseFeedInstant(e.startAt, currentTimeZone).toMillis();
        const to = parseFeedInstant(e.endAt, currentTimeZone).toMillis();
        return from <= startMs && startMs < to;
      });
      return event?.kind === 'working' ? event.branchId : null;
    },
    [data?.events, currentTimeZone],
  );

  const chooseServiceForDuration = useCallback(
    (durationMinutes: number | null): string | null => {
      if (durationMinutes != null) {
        const exact = filters.services.find(
          (service) => service.durationMinutes === durationMinutes,
        );
        if (exact) return exact.id;
      }
      if (calendarSettings.defaultServiceId) {
        const configured = filters.services.find(
          (service) => service.id === calendarSettings.defaultServiceId,
        );
        if (configured) return configured.id;
      }
      return resolveCalendarCreateFieldValue(filters.services, serviceId, null);
    },
    [filters.services, calendarSettings.defaultServiceId, serviceId],
  );

  const clearDraftAndPanel = useCallback(() => {
    if (createPanelRevealTimerRef.current !== null) {
      window.clearTimeout(createPanelRevealTimerRef.current);
      createPanelRevealTimerRef.current = null;
    }
    setSelected(null);
    setShowCreatePanel(false);
    setCreateInitialStart(null);
    setCreateInitialEnd(null);
    setCreateInitialBranchId(null);
    setCreateInitialServiceId(null);
    setDraftSlot(null);
    setCreateFormDirty(false);
    setGridSelection(null);
    setSelectionMenuOpen(false);
    setSelectionActionError(null);
    onDeepLinkChange('appt', null);
    calendarRef.current?.getApi().unselect();
  }, [onDeepLinkChange]);

  const openCreateDraft = useCallback(
    (start: Date, end: Date | null, revealWithDelay = false) => {
      if (!canManageAppointments) return;
      const startLocal =
        DateTime.fromJSDate(start).setZone(currentTimeZone).toFormat("yyyy-MM-dd'T'HH:mm") || null;
      if (!startLocal) return;
      const durationFromDrag = end
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000))
        : null;
      const serviceForDraft = chooseServiceForDuration(durationFromDrag);
      const serviceDuration =
        serviceForDraft != null
          ? (filters.services.find((service) => service.id === serviceForDraft)?.durationMinutes ??
            null)
          : null;
      const durationMinutes = durationFromDrag ?? serviceDuration ?? 60;
      const endDate = end ?? new Date(start.getTime() + durationMinutes * 60_000);
      const endLocal =
        DateTime.fromJSDate(endDate).setZone(currentTimeZone).toFormat("yyyy-MM-dd'T'HH:mm") ||
        null;
      if (!endLocal) return;
      const workingBranchId = findWorkingBranchIdForStart(startLocal);
      const branchForDraft =
        workingBranchId ??
        (calendarSettings.defaultBranchId &&
        filters.branches.some((b) => b.id === calendarSettings.defaultBranchId)
          ? calendarSettings.defaultBranchId
          : resolveCalendarCreateFieldValue(filters.branches, branchId, null));
      setSelected(null);
      setCreateInitialStart(startLocal);
      setCreateInitialEnd(endLocal);
      setCreateInitialBranchId(branchForDraft);
      setCreateInitialServiceId(serviceForDraft);
      setDraftSlot({
        start: DateTime.fromJSDate(start).toISO() ?? start.toISOString(),
        end: DateTime.fromJSDate(endDate).toISO() ?? endDate.toISOString(),
      });
      setCreateFormDirty(false);
      if (createPanelRevealTimerRef.current !== null) {
        window.clearTimeout(createPanelRevealTimerRef.current);
      }
      const revealPanel = () => {
        createPanelRevealTimerRef.current = null;
        setShowCreatePanel(true);
        onDeepLinkChange('appt', null);
      };
      if (revealWithDelay) {
        createPanelRevealTimerRef.current = window.setTimeout(
          revealPanel,
          CREATE_PANEL_REVEAL_DELAY_MS,
        );
      } else {
        revealPanel();
      }
    },
    [
      currentTimeZone,
      chooseServiceForDuration,
      filters.services,
      filters.branches,
      findWorkingBranchIdForStart,
      calendarSettings.defaultBranchId,
      branchId,
      onDeepLinkChange,
      canManageAppointments,
    ],
  );

  // ─── Grid time selection + contextual menu (CAL-ACTION-01…10) ─────────────

  /**
   * A tap, long-press or drag on the empty grid first persists a visible time selection and
   * opens the shared doctor contextual menu next to it. The appointment form is only reached
   * from «Новая запись» inside that menu.
   */
  const clearGridSelection = useCallback(() => {
    setSelectionMenuOpen(false);
    setSelectionActionError(null);
    setGridSelection(null);
    calendarRef.current?.getApi().unselect();
  }, []);

  const openGridSelection = useCallback(
    (start: Date, end: Date | null) => {
      if (!canManageAppointments) return;
      const startDt = DateTime.fromJSDate(start).setZone(currentTimeZone);
      const dateKey = startDt.toISODate();
      if (!dateKey) return;
      const serviceForDraft = chooseServiceForDuration(null);
      const serviceDuration =
        serviceForDraft != null
          ? (filters.services.find((service) => service.id === serviceForDraft)?.durationMinutes ??
            null)
          : null;
      const endDate = end ?? new Date(start.getTime() + (serviceDuration ?? 60) * 60_000);
      const endDt = DateTime.fromJSDate(endDate).setZone(currentTimeZone);
      const dayStart = startDt.startOf('day');
      setSelectionActionError(null);
      setGridSelection({
        dateKey,
        startMinute: Math.round(startDt.diff(dayStart, 'minutes').minutes),
        endMinute: Math.round(endDt.diff(dayStart, 'minutes').minutes),
        startAt: start,
        endAt: endDate,
      });
      if (!end) {
        // A single tap has no FullCalendar highlight of its own — create the same visible
        // selection a drag would leave behind. FullCalendar emits `select` synchronously,
        // so the re-entry guard is released immediately after the call.
        suppressSelectCallbackRef.current = true;
        calendarRef.current?.getApi().select(start, endDate);
        suppressSelectCallbackRef.current = false;
      }
      setSelectionMenuOpen(true);
    },
    [canManageAppointments, chooseServiceForDuration, currentTimeZone, filters.services],
  );

  /**
   * The selection read against the schedule layers of its day: which of them it covers, the
   * effective working bounds it would be written into, and what must not be closed.
   */
  const selectionContext = useMemo(() => {
    if (!gridSelection) return null;
    const working: MinuteInterval[] = [];
    const breaks: MinuteInterval[] = [];
    const busy: MinuteInterval[] = [];
    const branchIds = new Set<string>();
    for (const event of displayableCalendarEvents) {
      const interval = eventDayInterval(
        event.startAt,
        event.endAt,
        currentTimeZone,
        gridSelection.dateKey,
      );
      if (!interval) continue;
      if (event.kind === 'working') {
        working.push(interval);
        if (event.branchId) branchIds.add(event.branchId);
        continue;
      }
      if (event.kind === 'break') {
        breaks.push(interval);
        continue;
      }
      if (event.kind === 'appointment' && !isCancelledAppointmentStatus(event.status)) {
        busy.push(interval);
      }
    }
    const selection: MinuteInterval = {
      startMinute: gridSelection.startMinute,
      endMinute: gridSelection.endMinute,
    };
    const touchesWorking = intersectsAny(selection, working);
    const touchesBreak = intersectsAny(selection, breaks);
    const kind: CalendarSelectionKind =
      touchesWorking && touchesBreak
        ? 'mixed'
        : touchesWorking
          ? 'working'
          : touchesBreak
            ? 'break'
            : 'outside';
    return {
      kind,
      working,
      breaks,
      busy,
      branchIds: [...branchIds],
      dayStartMinute: working.length > 0 ? Math.min(...working.map((i) => i.startMinute)) : 0,
      dayEndMinute: working.length > 0 ? Math.max(...working.map((i) => i.endMinute)) : 0,
    };
  }, [currentTimeZone, displayableCalendarEvents, gridSelection]);

  const canEditSelectionSchedule =
    canManageAvailability &&
    scopeBootstrap.ownSpecialistId !== null &&
    (scheduleScope.scope === 'mine' ||
      (scheduleScope.scope === 'specialist' &&
        scheduleScope.specialistId === scopeBootstrap.ownSpecialistId));
  const canOpenWorkingHours = filters.branches.length > 0 && canEditSelectionSchedule;

  const selectionMenuActions = useMemo((): CalendarSelectionAction[] => {
    if (!canManageAppointments) return [];
    if (!selectionContext) return [];
    const canEditSchedule = canEditSelectionSchedule;
    if (selectionContext.kind === 'working') {
      return canEditSchedule ? ['create', 'add-break'] : ['create'];
    }
    if (selectionContext.kind === 'mixed') {
      return canEditSchedule ? ['add-break', 'open-for-booking', 'create'] : ['create'];
    }
    // CAL-ACTION-04: break, closed slot and outside-working-hours selections all read as
    // `'break'`/`'outside'` here — none of them is currently bookable, so both offer the same
    // "reopen" action; `applySelectionScheduleChange` picks the right mutation per kind.
    if (selectionContext.kind === 'break' || selectionContext.kind === 'outside') {
      return canEditSchedule || (selectionContext.kind === 'outside' && canOpenWorkingHours)
        ? ['open-for-booking', 'create']
        : ['create'];
    }
    return ['create'];
  }, [canManageAppointments, canEditSelectionSchedule, canOpenWorkingHours, selectionContext]);

  /**
   * Anchors the contextual menu to the live FullCalendar highlight so it tracks the selection
   * while the grid scrolls, and keeps the last known rect when a refetch repaints the grid.
   */
  const selectionAnchor = useMemo(
    () => ({
      getBoundingClientRect: () => {
        const host = calendarViewportRef.current;
        const highlights = host
          ? Array.from(host.querySelectorAll<HTMLElement>('.fc-highlight'))
          : [];
        if (highlights.length > 0) {
          const rects = highlights.map((element) => element.getBoundingClientRect());
          const top = Math.min(...rects.map((rect) => rect.top));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));
          const left = Math.min(...rects.map((rect) => rect.left));
          const right = Math.max(...rects.map((rect) => rect.right));
          const merged = {
            x: left,
            y: top,
            top,
            left,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
          };
          selectionAnchorRectRef.current = merged;
          return merged;
        }
        return (
          selectionAnchorRectRef.current ?? {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
          }
        );
      },
    }),
    [],
  );

  /**
   * CAL-ACTION-06/07/10: both schedule actions persist through the canonical per-date
   * `working-days` contract — one upsert of the effective day with the recomputed break list.
   */
  const applySelectionScheduleChange = useCallback(
    async (mode: 'add-break' | 'open-for-booking', target?: { branchId: string }) => {
      if (!gridSelection || !selectionContext) return;
      if (!canManageAvailability || !canEditSelectionSchedule) {
        setSelectionActionError(SELECTION_MUTATION_ERRORS.foreign_specialist ?? null);
        return;
      }
      if (selectionContext.branchIds.length > 1) {
        setSelectionActionError(SELECTION_MUTATION_ERRORS.multiple_branches ?? null);
        return;
      }
      const editInput = {
        dayStartMinute: selectionContext.dayStartMinute,
        dayEndMinute: selectionContext.dayEndMinute,
        breaks: selectionContext.breaks,
        selection: {
          startMinute: gridSelection.startMinute,
          endMinute: gridSelection.endMinute,
        },
        busy: selectionContext.busy,
      };
      // CAL-ACTION-04/07: a break/mixed selection reopens by trimming the existing break; an
      // outside-working-hours (or closed-slot) selection has no break to trim, so it widens the
      // working day itself onto the selected side instead — same `PUT /working-days` write below.
      const result =
        mode === 'add-break'
          ? addBreakToWorkingDay(editInput)
          : selectionContext.kind === 'outside'
            ? openWorkingHoursForSelection(editInput)
            : openWorkingDayIntervalForBooking(editInput);
      if (!result.ok) {
        setSelectionActionError(
          SELECTION_MUTATION_ERRORS[result.error] ?? 'Не удалось обновить график.',
        );
        return;
      }
      if (result.breaks.length > MAX_WORKING_DAY_BREAKS) {
        setSelectionActionError(SELECTION_MUTATION_ERRORS.too_many_breaks ?? null);
        return;
      }
      const nextDayStartMinute =
        'dayStartMinute' in result ? result.dayStartMinute : selectionContext.dayStartMinute;
      const nextDayEndMinute =
        'dayEndMinute' in result ? result.dayEndMinute : selectionContext.dayEndMinute;
      setSelectionActionPending(true);
      setSelectionActionError(null);
      try {
        const res = await fetch(`${API_BASE}/working-days`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            dates: [gridSelection.dateKey],
            startMinute: nextDayStartMinute,
            endMinute: nextDayEndMinute,
            breaks: result.breaks,
            branchId: target?.branchId ?? selectionContext.branchIds[0],
          }),
        });
        const json: unknown = await res.json().catch(() => null);
        const ok = res.ok && typeof json === 'object' && json !== null && 'ok' in json && json.ok;
        if (!ok) {
          setSelectionActionError('Не удалось обновить график.');
          return;
        }
        setOpenWorkingHoursDialog(null);
        clearGridSelection();
        // The schedule changed under the visible range — bypass the duplicate-load window.
        recentLoadRef.current = null;
        load();
      } catch {
        setSelectionActionError('Не удалось обновить график.');
      } finally {
        setSelectionActionPending(false);
      }
    },
    [
      canEditSelectionSchedule,
      canManageAvailability,
      clearGridSelection,
      gridSelection,
      load,
      selectionContext,
    ],
  );

  const beginOpenWorkingHours = useCallback(() => {
    if (!gridSelection || !selectionContext) return;
    if (selectionContext.kind !== 'outside') {
      void applySelectionScheduleChange('open-for-booking');
      return;
    }
    const branchOptions = filters.branches;
    const activeBranchId =
      branchId && branchOptions.some((branch) => branch.id === branchId) ? branchId : null;
    const defaultBranchId =
      activeBranchId ??
      (calendarSettings.defaultBranchId &&
      branchOptions.some((branch) => branch.id === calendarSettings.defaultBranchId)
        ? calendarSettings.defaultBranchId
        : branchOptions.length === 1
          ? (branchOptions[0]?.id ?? null)
          : null);

    if ((activeBranchId || branchOptions.length === 1) && defaultBranchId) {
      void applySelectionScheduleChange('open-for-booking', {
        branchId: defaultBranchId,
      });
      return;
    }

    setSelectionMenuOpen(false);
    setSelectionActionError(null);
    setOpenWorkingHoursDialog({
      branchId: defaultBranchId,
    });
  }, [
    applySelectionScheduleChange,
    branchId,
    calendarSettings.defaultBranchId,
    filters.branches,
    gridSelection,
    selectionContext,
  ]);

  const runSelectionAction = useCallback(
    (action: CalendarSelectionAction) => {
      if (action === 'create') {
        const selection = gridSelection;
        setSelectionMenuOpen(false);
        setGridSelection(null);
        setSelectionActionError(null);
        if (selection) openCreateDraft(selection.startAt, selection.endAt);
        return;
      }
      if (action === 'open-for-booking') {
        beginOpenWorkingHours();
        return;
      }
      void applySelectionScheduleChange(action);
    },
    [applySelectionScheduleChange, beginOpenWorkingHours, gridSelection, openCreateDraft],
  );

  useEffect(() => {
    if (
      !createAppointmentRequestId ||
      createAppointmentRequestId <= handledCreateAppointmentRequestRef.current
    ) {
      return;
    }
    handledCreateAppointmentRequestRef.current = createAppointmentRequestId;
    const now = DateTime.now().setZone(currentTimeZone);
    const start =
      now.minute < 30
        ? now.set({ minute: 30, second: 0, millisecond: 0 })
        : now.plus({ hours: 1 }).startOf('hour');
    openCreateDraft(start.toJSDate(), null);
  }, [createAppointmentRequestId, currentTimeZone, openCreateDraft]);

  useEffect(
    () => () => {
      if (createPanelRevealTimerRef.current !== null) {
        window.clearTimeout(createPanelRevealTimerRef.current);
      }
    },
    [],
  );

  // ─── FullCalendar view mapping ─────────────────────────────────────────────
  // Объявлено до `calendarEvents`: оформление записи (PAY-APPT-14) выводится из типа FC-вида, а
  // не из отдельной копии условия «это месяц».
  const fcView =
    view === 'day'
      ? 'timeGridDay'
      : view === 'weekgrid'
        ? 'timeGridWeek'
        : view === 'month'
          ? 'dayGridMonth'
          : 'timeGridDay'; // 3days handled as custom range — use timeGridDay with visibleRange

  const calendarEvents = useMemo<EventInput[]>(() => {
    if (!data) return [];
    const isTimeGrid = view !== 'month';
    // §3.14: paint the whole non-working span (pre-shift + post-shift + breaks)
    // gray; working time stays white. Only in hour-grid views (3 дня / Неделя /
    // День) — a month grid has no time axis to fill. Replaces the old per-break
    // background events; the complement fill subsumes them.
    // #6: compute all visible day keys so days with no schedule get full-grey fill.
    const visibleDayKeysForFill: string[] = (() => {
      if (!isTimeGrid) return [];
      const from = DateTime.fromISO(calendarFeedRange.from, { zone: currentTimeZone });
      const to = DateTime.fromISO(calendarFeedRange.to, { zone: currentTimeZone });
      const totalDays = Math.max(1, Math.ceil(to.diff(from, 'days').days));
      const keys: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const k = from.plus({ days: i }).toISODate();
        if (k) keys.push(k);
      }
      return keys;
    })();

    // Всегда генерируем серый фон для timeGrid, даже если workingBounds=null
    // или прежняя display-настройка выключена: рабочие границы — часть самой сетки,
    // а не опциональный декоративный слой. Если рабочих часов нет, день целиком нерабочий.
    // Временная ось теперь полная (00:00–24:00), поэтому фон покрывает весь день.
    const grayFill = isTimeGrid
      ? buildDoctorCalendarNonWorkingRanges(
          displayableCalendarEvents.filter((e) => e.kind === 'working'),
          currentTimeZone,
          visibleDayKeysForFill,
          loMinute,
          hiMinute,
        ).map((f) => ({
          id: f.id,
          start: f.start,
          end: f.end,
          display: 'background' as const,
          classNames: [...doctorCalendarNonWorkingClassNames],
          editable: false,
          extendedProps: { kind: 'nonworking' as const },
        }))
      : [];
    const mapped = searchedCalendarEvents
      .map((event) => {
        // Рабочее время — не рендерим (фон белый).
        if (event.kind === 'working') return null;

        // CAL-ACTION-09: перерыв визуально совпадает с нерабочим временем до и после смены —
        // тот же лёгкий фон и без подписи внутри сетки.
        if (event.kind === 'break' && isTimeGrid) {
          return {
            id: `break:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            display: 'background' as const,
            classNames: [...doctorCalendarNonWorkingClassNames],
            editable: false,
            extendedProps: { kind: 'break' as const },
          };
        }
        if (event.kind === 'break') return null;

        if (event.kind === 'block') {
          return {
            id: `block:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            title: eventTitle(event),
            editable: false,
            classNames: [eventClassName(event)],
            extendedProps: { kind: event.kind, block: event },
          };
        }
        if (event.kind === 'freeSlot') {
          return {
            id: `free:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            title: eventTitle(event),
            editable: false,
            classNames: [eventClassName(event)],
            extendedProps: { kind: event.kind },
          };
        }
        return {
          id: event.id,
          start: toFcDate(event.startAt, currentTimeZone),
          end: toFcDate(event.endAt, currentTimeZone),
          title: eventTitle(event),
          // PAY-APPT-14: в dayGrid событие со временем по умолчанию сжимается до «точки» без
          // рамки и поверхности — общий payment-pending border и цвет филиала тогда пропадают
          // молча. Режим отрисовки выводит общая функция из типа вида, а не локальное условие.
          display: doctorCalendarAppointmentDisplay(fcView),
          editable: canManageAppointments && !isCancelledAppointmentStatus(event.status),
          durationEditable: canManageAppointments && !isCancelledAppointmentStatus(event.status),
          startEditable: canManageAppointments && !isCancelledAppointmentStatus(event.status),
          classNames: [eventClassName(event)],
          ...doctorCalendarAppointmentBranchColors(event),
          extendedProps: {
            kind: event.kind,
            appointment: event,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const draft = draftSlot
      ? [
          {
            id: 'draft:create',
            start: draftSlot.start,
            end: draftSlot.end,
            title: 'Новая запись',
            editable: false,
            classNames: ['!bg-sky-500/20 text-sky-950 !border-sky-500/50 border-dashed'],
            extendedProps: { kind: 'draft' as const },
          },
        ]
      : [];
    return [...grayFill, ...mapped, ...draft];
  }, [
    data,
    displayableCalendarEvents,
    searchedCalendarEvents,
    view,
    fcView,
    calendarFeedRange,
    currentTimeZone,
    loMinute,
    hiMinute,
    draftSlot,
    canManageAppointments,
  ]);

  // ─── Reschedule (drag/resize) ──────────────────────────────────────────────

  const performReschedule = useCallback(
    async (
      appointment: CalendarAppointmentEvent,
      startAt: string,
      endAt: string,
      staffComment?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!canManageAppointments) return { ok: false, error: 'forbidden' };
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
      );
      const res = await fetch(
        `${API_BASE}/appointments/${encodeURIComponent(appointment.id)}/manual-reschedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newStartAt: startAt,
            newEndAt: endAt,
            durationMinutes,
            ...(staffComment && staffComment.trim() ? { staffComment: staffComment.trim() } : {}),
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? `load_failed_${res.status}` };
      }
      return { ok: true };
    },
    [canManageAppointments],
  );

  // R34: drag/resize не применяются сразу — открываем диалог подтверждения.
  const openRescheduleConfirm = useCallback(
    (arg: any) => {
      if (!canManageAppointments) return arg.revert();
      const appointment = arg.event.extendedProps?.appointment as
        CalendarAppointmentEvent | undefined;
      if (!appointment) return arg.revert();
      const nextStart = arg.event.start?.toISOString();
      const nextEnd = arg.event.end?.toISOString();
      if (!nextStart || !nextEnd) return arg.revert();
      pendingRescheduleRef.current = { appointment, arg, newStartAt: nextStart, newEndAt: nextEnd };
      setRescheduleComment('');
      setRescheduleError(null);
      setRescheduleBusy(false);
      setPendingReschedule({
        patientName: appointment.patientName ?? null,
        oldStartAt: appointment.startAt,
        oldEndAt: appointment.endAt,
        newStartAt: nextStart,
        newEndAt: nextEnd,
      });
    },
    [canManageAppointments],
  );

  const cancelRescheduleConfirm = useCallback(() => {
    pendingRescheduleRef.current?.arg.revert();
    pendingRescheduleRef.current = null;
    setPendingReschedule(null);
    setRescheduleError(null);
    setRescheduleBusy(false);
  }, []);

  const confirmRescheduleConfirm = useCallback(async () => {
    const ctx = pendingRescheduleRef.current;
    if (!ctx) return;
    setRescheduleBusy(true);
    setRescheduleError(null);
    const result = await performReschedule(
      ctx.appointment,
      ctx.newStartAt,
      ctx.newEndAt,
      rescheduleComment,
    );
    if (result.ok) {
      pendingRescheduleRef.current = null;
      setPendingReschedule(null);
      setRescheduleBusy(false);
      // Перерисовать календарь из источника (применённое время уже на сетке).
      load();
      return;
    }
    // Ошибка — показываем в диалоге, запись пока остаётся на новом месте до решения врача.
    setRescheduleBusy(false);
    setRescheduleError(rescheduleErrorLabel(result.error));
  }, [performReschedule, rescheduleComment, load]);

  const onDrop = useCallback((arg: any) => openRescheduleConfirm(arg), [openRescheduleConfirm]);
  const onResize = useCallback((arg: any) => openRescheduleConfirm(arg), [openRescheduleConfirm]);

  // CAL-ACTION-01: a drag over the grid keeps its visible selection and opens the menu.
  const onSelect = useCallback(
    (arg: { start?: Date | null; end?: Date | null }) => {
      if (suppressSelectCallbackRef.current) {
        suppressSelectCallbackRef.current = false;
        return;
      }
      if (filtersPanelOpen) {
        setFiltersPanelOpen(false);
        calendarRef.current?.getApi().unselect();
        return;
      }
      if (Date.now() <= suppressCalendarInteractionUntilRef.current) {
        suppressCalendarInteractionUntilRef.current = 0;
        calendarRef.current?.getApi().unselect();
        return;
      }
      const start: Date | null = arg.start ?? null;
      const end: Date | null = arg.end ?? null;
      if (!start) return;
      lastSelectAtRef.current = Date.now();
      openGridSelection(start, end ?? null);
    },
    [filtersPanelOpen, openGridSelection],
  );

  const closeDraftOrSelectionFromGrid = useCallback((): boolean => {
    if (createFormDirty && showCreatePanel) {
      const ok = window.confirm('Событие не сохранено, вы уверены что хотите сбросить изменения?');
      if (!ok) return false;
    }
    clearDraftAndPanel();
    return true;
  }, [clearDraftAndPanel, createFormDirty, showCreatePanel]);

  const openAppointmentDetails = useCallback(
    (appointment: CalendarAppointmentEvent) => {
      setFiltersPanelOpen(false);
      if (showCreatePanel && createFormDirty) {
        const ok = window.confirm(
          'Событие не сохранено, вы уверены что хотите сбросить изменения?',
        );
        if (!ok) return;
      }
      setSelected(appointment);
      setShowCreatePanel(false);
      setCreateInitialStart(null);
      setCreateInitialEnd(null);
      setCreateInitialBranchId(null);
      setCreateInitialServiceId(null);
      setDraftSlot(null);
      setCreateFormDirty(false);
      onDeepLinkChange('appt', appointment.id);
    },
    [createFormDirty, onDeepLinkChange, showCreatePanel],
  );

  // For 3days, use timeGrid with 3 days duration
  const fcInitialView = useMemo(() => {
    if (view === '3days') return 'timeGrid3days';
    return fcView;
  }, [fcView, view]);

  const fcViews = useMemo((): NonNullable<FullCalendarOptions['views']> => {
    if (view === '3days') {
      return {
        timeGrid3days: {
          type: 'timeGrid',
          duration: { days: 3 },
          buttonText: '3 дня',
        },
      };
    }
    if (view === 'month') {
      return {
        dayGridMonth: {
          dayCellClassNames: () => [],
        },
      };
    }
    return {};
  }, [view]);

  // ─── Render ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (serverSearchQuery !== null && serverSearchQuery !== searchQuery.trim()) {
      setServerSearchQuery(null);
      setServerSearchTotal(null);
      setServerSearchHasMore(false);
    }
  }, [searchQuery, serverSearchQuery]);

  const visibleListAppointments = useMemo(() => {
    const source = serverSearchQuery ? serverSearchItems : listAppointments;
    const query = searchQuery.trim().toLocaleLowerCase('ru');
    return source.filter((appointment) => {
      if (!includeCancelledAppointments && isCancelledAppointmentStatus(appointment.status)) {
        return false;
      }
      if (kpiFilterPredicate && !kpiFilterPredicate(appointment)) return false;
      if (serverSearchQuery || !query) return true;
      return [
        appointment.patientName,
        appointment.patientPhone,
        appointment.serviceTitle,
        appointment.branchTitle,
      ].some((value) => value?.toLocaleLowerCase('ru').includes(query));
    });
  }, [
    listAppointments,
    searchQuery,
    serverSearchItems,
    serverSearchQuery,
    includeCancelledAppointments,
    kpiFilterPredicate,
  ]);
  /**
   * «С какого периода» для счётчика найденного в ленте (владелец 15.09, п.8): самая ранняя из
   * найденных записей. Ленты и результаты серверного поиска отсортированы по возрастанию
   * (`mergeAppointmentPages`, `order: 'asc'`), поэтому это первый элемент. После «искать более
   * ранние» дата сама сдвигается назад вместе с новыми результатами.
   */
  const searchResultsFromLabel = useMemo(() => {
    if (renderMode !== 'list' || !searchQuery.trim()) return null;
    const earliest = visibleListAppointments[0];
    if (!earliest) return null;
    const day = parseFeedInstant(earliest.startAt, currentTimeZone).setLocale('ru');
    return day.isValid ? day.toFormat('d LLL yyyy') : null;
  }, [currentTimeZone, renderMode, searchQuery, visibleListAppointments]);

  /**
   * Текст кнопки периода. В сетке — границы видимого периода датами (владелец 15.09, п.6: «даты,
   * месяц сокращенно и год» во всех размерах экрана). В ленте — одна дата, та, что сейчас наверху
   * экрана (п.7); пока прокрутка идёт, текст переписывает `handleListVisibleDateChange` напрямую в
   * DOM, а сюда попадает уже устоявшееся значение.
   */
  const periodNavLabelText =
    renderMode === 'list'
      ? listPeriodNavLabel(listVisibleDate ?? listAnchorDate, currentTimeZone)
      : periodNavLabel(view, anchorDate, currentTimeZone);

  const branchShortLabels = useMemo(
    () =>
      new Map(
        filters.branches.map((branch) => [branch.id, branch.shortLabel ?? branch.label] as const),
      ),
    [filters.branches],
  );

  const eventPanelOpen = selected !== null || showCreatePanel;
  const eventPanelTitle = selected ? (
    <DoctorModalStackedTitle
      label={`Запись на ${appointmentAccusative}`}
      patientName={selected.patientName ?? patientSingularLabel}
      patientHref={selected.platformUserId ? patientCardHref(selected.platformUserId) : null}
      patientOnSupport={selected.patientOnSupport === true}
    />
  ) : (
    'Новая запись'
  );
  const eventPanelNode = eventPanelOpen ? (
    <DoctorCalendarEventPanel
      key={selected?.id ?? 'create'}
      apiBase={API_BASE}
      selected={selected}
      timeZone={currentTimeZone}
      filterMeta={filters}
      activeFilters={activeFilters}
      ownSpecialistId={scopeBootstrap.ownSpecialistId}
      clinicSpecialists={scopeBootstrap.specialists}
      appointmentsManageOwn={canManageAppointments}
      flushChrome
      startInCreate={showCreatePanel && !selected}
      createInitialStart={createInitialStart}
      createInitialEnd={createInitialEnd}
      createInitialBranchId={createInitialBranchId}
      createInitialServiceId={createInitialServiceId}
      createInitialSpecialistId={defaultCreateSpecialistId}
      onCreateDirtyChange={setCreateFormDirty}
      onClose={clearDraftAndPanel}
      onChanged={() => {
        clearDraftAndPanel();
        recentLoadRef.current = null;
        load();
        // `load()` обновляет только календарную сетку: запрос ленты стоит под
        // `renderMode === 'calendar'`, а с 15.09 под тем же условием и счёт КПИ. Поэтому создание,
        // отмена и перенос записи из режима списка не меняли на экране ничего, пока человек не
        // перезагружал страницу. `onUpdated` рядом это уже делал — здесь была дыра, а не решение.
        if (renderMode === 'list') void loadInitialAppointmentFeed();
      }}
      onUpdated={(updated) => {
        if (updated) setSelected(updated);
        recentLoadRef.current = null;
        load();
        if (renderMode === 'list') void loadInitialAppointmentFeed();
      }}
    />
  ) : null;
  const handleKpiClick = (key: ScheduleKpiFilterKey | 'recordsInPeriod') => {
    if (key === 'recordsInPeriod') {
      setSelectedKpiFilters(NO_KPI_FILTERS);
      return;
    }
    setSelectedKpiFilters((current) =>
      current.includes(key) ? current.filter((selected) => selected !== key) : [...current, key],
    );
  };
  const toggleFiltersPanel = () => {
    if (filtersPanelOpen) {
      setFiltersPanelOpen(false);
      return;
    }
    if (eventPanelOpen && !closeDraftOrSelectionFromGrid()) return;
    setFiltersPanelOpen(true);
  };

  return (
    // `xl:mt-3` возвращает отступ под шапкой страницы на десктопе. Панель таба висит на
    // `DOCTOR_DESKTOP_ATTACH_TO_PAGE_HEADER_CLASS` (`md:-mt-3`): она гасит межблочный зазор shell,
    // потому что сразу под шапкой шёл липкий тулбар со своими вертикальными отступами. С 15.09
    // тулбар на xl+ скрыт целиком (владелец: «от прошлого верхнего тулбара осталась маленькая серая
    // полоска — убрать»), и гасить стало нечего — сетка и правая панель упирались в шапку без
    // единого пикселя. Отступ возвращаем ровно там, где пропал тулбар, а не снятием `md:-mt-3` в
    // shell: на md/lg тулбар на месте и зазор там по-прежнему лишний.
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4 xl:mt-3">
      {/* Toolbar (D1) — full width. R30: прилипает 2-м рядом под per-page-шапкой
          (комбинируем базовый sticky-класс с top-офсетом, как эталон exercises). */}
      {/* Владелец 15.09: «в десктопе от прошлого верхнего тулбара осталась маленькая серая
          полоска — убрать». Полоска — сам этот контейнер: `DoctorPageToolbar` рисует рамку снизу
          и вертикальные отступы независимо от содержимого, а на xl+ всё содержимое скрыто (оба
          мобильных ряда — `md:hidden`, планшетный триггер — `xl:hidden`), поэтому оставалась
          пустая полоса с рамкой. Прячем контейнер целиком там, где ему нечего показывать. */}
      <DoctorCatalogStickyToolbar
        withinRemainingHeight
        className="flex flex-wrap items-center gap-2 xl:hidden"
        data-testid="cal-toolbar"
      >
        <div className="flex w-full min-w-0 items-center gap-1 md:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(INACTIVE_TOOLBAR_BUTTON_CLASS, 'h-8 px-2 text-xs')}
            onClick={() => {
              setFiltersPanelOpen(false);
              goToday();
            }}
          >
            Сегодня
          </Button>

          <DoctorSchedulePeriodNav
            label={periodNavLabelText}
            labelRef={registerPeriodLabelNode('mobile')}
            onPrev={() => {
              setFiltersPanelOpen(false);
              shiftAnchor(-1);
            }}
            onNext={() => {
              setFiltersPanelOpen(false);
              shiftAnchor(1);
            }}
            onLabelClick={() => {
              setFiltersPanelOpen(false);
              updateMobileVisibleDate(mobileVisibleDateRef.current, true);
              setDatePickerOpen(true);
            }}
            prevAriaLabel="Предыдущий период"
            nextAriaLabel="Следующий период"
            labelAriaLabel="Перейти к дате"
          />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="default"
              className="size-[32px]"
              aria-label={
                renderMode === 'list'
                  ? 'Список. Переключить на три дня'
                  : view === 'month'
                    ? 'Месяц. Переключить на список'
                    : 'Три дня. Переключить на месяц'
              }
              onClick={() => {
                setFiltersPanelOpen(false);
                updateMobileVisibleDate(mobileVisibleDateRef.current, true);
                if (renderMode === 'list') {
                  setRenderMode('calendar');
                  setView('3days');
                  return;
                }
                if (view === 'month') {
                  setRenderMode('list');
                  return;
                }
                if (view === 'day') {
                  setDrillBackView(null);
                  onDeepLinkChange('from', null);
                }
                setView('month');
              }}
            >
              {renderMode === 'list' ? (
                <List className="size-4" aria-hidden />
              ) : view === 'month' ? (
                <CalendarDays className="size-4" aria-hidden />
              ) : (
                <Columns3 className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant={filtersPanelOpen && !hasActiveScheduleFilters ? 'default' : 'outline'}
              className={cn(
                'size-[32px]',
                // Белый фон «спящей» кнопки нельзя класть поверх варианта `default`: у того белый
                // значок, и вместе они дают белое на белом. Пока панель открыта и фильтров нет,
                // кнопку красит сам вариант.
                hasActiveScheduleFilters
                  ? DOCTOR_ACTIVE_FILTER_BUTTON_CLASS
                  : !filtersPanelOpen && INACTIVE_TOOLBAR_BUTTON_CLASS,
              )}
              onClick={toggleFiltersPanel}
              aria-label="Фильтры"
              aria-expanded={filtersPanelOpen}
              aria-controls="schedule-filters-panel"
            >
              <span className="relative inline-flex">
                <Filter className="size-4" aria-hidden />
                <DoctorAttentionBadge count={hasActiveScheduleFilters ? 1 : 0} dot />
              </span>
            </Button>
          </div>
        </div>

        {/* Владелец 15.09: «поиск перенести под блок с выбором филиала/услуги/отмен … и в
            десктопе/планшете и в мобиле» — строка поиска ушла из верхнего тулбара телефона в
            модалку фильтров, под блок фильтров (`renderScheduleSearchBlock`). */}

        {/* Владелец 14.09: «в десктопном и планшетном виде надо верхнюю панель перенести в
            правый блок фильтров» — вид/период/поиск переехали в панель фильтров (блоки «Вид»,
            «Период», «Поиск по записям» — см. `renderScheduleTopBlocks` ниже), десктоп (xl+)
            видит их в постоянно открытом `<aside>`, планшет (md..xl) — открыв ту же панель этой
            кнопкой. Сам тулбар в этом диапазоне ширины несёт только триггер открытия панели. */}
        <div className="hidden w-full items-center justify-end gap-2 md:flex xl:hidden">
          <Button
            type="button"
            size="sm"
            variant={filtersPanelOpen && !hasActiveScheduleFilters ? 'default' : 'outline'}
            className={cn(
              'gap-2',
              // То же, что и у значка выше: с открытой панелью и без фильтров цвет даёт вариант
              // `default`, иначе белая надпись легла бы на белый фон.
              hasActiveScheduleFilters
                ? DOCTOR_ACTIVE_FILTER_BUTTON_CLASS
                : !filtersPanelOpen && INACTIVE_TOOLBAR_BUTTON_CLASS,
            )}
            onClick={toggleFiltersPanel}
            aria-expanded={filtersPanelOpen}
            aria-controls="schedule-filters-panel"
          >
            <span className="relative inline-flex">
              <Filter className="size-4" aria-hidden />
              <DoctorAttentionBadge count={hasActiveScheduleFilters ? 1 : 0} dot />
            </span>
            Фильтры
          </Button>
        </div>
      </DoctorCatalogStickyToolbar>

      {/* Error */}
      {error ? (
        <p className="text-sm text-destructive" data-testid="cal-error">
          {error}
        </p>
      ) : null}
      {selectionActionError ? (
        <p className="text-sm text-destructive" data-testid="cal-selection-error">
          {selectionActionError}
        </p>
      ) : null}

      {/* Main content row: calendar/list + aside panel */}
      <div
        className={cn(
          'block min-h-0 flex-1 pb-0 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)] xl:items-start xl:gap-4',
          renderMode === 'calendar' && 'flex min-h-0 flex-1 pb-0 xl:items-stretch',
          renderMode === 'list' && 'xl:min-h-0 xl:overflow-hidden xl:pb-0',
        )}
      >
        {/* Content area */}
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1',
            renderMode === 'calendar' && 'h-full md:min-h-0',
            renderMode === 'list' && '-mx-3 h-full min-h-0 md:mx-0',
          )}
        >
          {renderMode === 'list' ? (
            // Continuous list view — grouped by month/day, lazily paged in both directions
            <ListView
              appointments={visibleListAppointments}
              anchorDate={listScrollTargetDate ?? listAnchorDate}
              timeZone={currentTimeZone}
              loading={listLoading}
              loadingEarlier={listLoadingEarlier}
              loadingLater={listLoadingLater || serverSearchLoading}
              hasEarlier={!serverSearchQuery && listHasEarlier}
              hasLater={serverSearchQuery ? serverSearchHasMore : listHasLater}
              onLoadEarlier={() => void loadEarlierAppointments()}
              onLoadLater={() =>
                void (serverSearchQuery ? loadMoreSearchResults() : loadLaterAppointments())
              }
              onSelect={(appt) => {
                setFiltersPanelOpen(false);
                setSelected(appt);
                setShowCreatePanel(false);
                onDeepLinkChange('appt', appt.id);
              }}
              branchShortLabels={branchShortLabels}
              showSpecialist={filters.specialists.length > 1}
              scrollToTodayRequest={listTodayRequest}
              onVisibleDateChange={handleListVisibleDateChange}
              repositionRequest={listRepositionRequest}
            />
          ) : (
            // FullCalendar
            <div className="relative -mx-3 h-full min-h-0 md:mx-0">
              <div
                className={cn(
                  'relative h-full min-h-0 w-full flex-1 touch-pan-y overscroll-contain border-0 bg-card pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-full md:rounded-xl md:border md:border-border',
                  view === 'month' && isMobileViewport
                    ? 'overflow-x-hidden overflow-y-auto'
                    : 'overflow-hidden',
                )}
                ref={calendarViewportRef}
                data-mobile-calendar-viewport=""
                onPointerDownCapture={() => {
                  if (calendarFilterOpenRef.current) {
                    suppressCalendarInteractionUntilRef.current = Date.now() + 1000;
                  }
                }}
              >
                {calendarLoading ? (
                  <DoctorPanelLoading className="absolute inset-0 z-10 bg-background/70" />
                ) : null}
                <div className="h-full min-h-0">
                  <style>{`
                /* §3.7 — статусные Tailwind-цвета приходят important-утилитами из eventClassName
                   (бьют инлайн-синий FC в timeGrid). Здесь убираем тень FC,
                   принудительно делаем текст записей ТЁМНЫМ (FC форсит белый через
                   --fc-event-text-color, его и переопределяем — иначе белое на светлом),
                   и курсор pointer на всех записях (в т.ч. отменённых — клик работает). */

                /* CAL-P1 — kill green flash on first paint.
                   FC default --fc-bg-event-color is #8fdf82 (green, opacity 0.3).
                   All display:"background" events here use Tailwind !bg-[#eeeeee] / !bg-[#d1d5db]
                   which win the cascade, but only after the stylesheet settles. At frame-0 FC
                   paints its default green before the important-utilities kick in. Setting
                   --fc-bg-event-color to transparent on the .fc root means the very first
                   paint is transparent (not green); the Tailwind bg utilities apply in the
                   same frame and set the final colour normally.
                   CR-8: non-working = #eee/0.6, break = #eee/0.6 (both light, owner pref). */
                .fc {
                  --fc-bg-event-color: transparent;
                  --fc-border-color: color-mix(in srgb, var(--border) 62%, transparent);
                }

                /* UI-1a: grid stays legible without competing with appointments. */
                .fc .fc-timegrid-slot {
                  border-color: color-mix(in srgb, var(--border) 52%, transparent) !important;
                }

                /* Drag-selection and click-created draft use the same calendar draft color. */
                .fc .fc-highlight { background-color: rgb(14 165 233 / 20%) !important; }

                .fc-timegrid-event-harness { margin-inline: 1px; }
                /* Pointer only on real (interactive) events. Background events —
                   non-working fill + breaks — are not clickable (dateClick is
                   suppressed over them), so they keep the default cursor instead of
                   the misleading «hand». */
                .fc-event:not(.fc-bg-event) {
                  cursor: pointer !important;
                }
                .fc-event {
                  box-shadow: none !important;
                  --fc-event-text-color: var(--foreground) !important;
                }
                .fc-bg-event {
                  cursor: default !important;
                  pointer-events: none !important;
                }
                .fc-timegrid-bg-harness { pointer-events: none !important; }
                /* Пол по умолчанию для .fc-v-event (у него FC не задаёт цвет текста своим
                   правилом) — БЕЗ !important, чтобы инлайновый textColor от
                   doctorCalendarAppointmentBranchColors() (цвет филиала) побеждал: инлайн-стиль
                   и без !important сильнее любого селекторного правила (аудит 14.09, Э2 FAIL). */
                .fc-event .fc-event-main { color: var(--foreground); }
                /* R10 — прошедшие записи приглушаем, будущие/актуальные ярче */
                .fc-event.fc-event-past { opacity: 0.6; }

                /* §3.9 — мягкая типографика заголовков колонок/дней */
                .fc-col-header-cell {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                }
                .fc-col-header-cell-cushion {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                  text-transform: none !important;
                  color: var(--muted-foreground, currentColor) !important;
                  padding-block: 0.25rem !important;
                }
                .fc .fc-scrollgrid-section-header th {
                  padding-top: 0.125rem;
                  padding-bottom: 0.125rem;
                }

                /* §3.10 — убрать жёлтую заливку «сегодня» в месяце */
                .fc .fc-day-today {
                  --fc-today-bg-color: transparent !important;
                  background-color: transparent !important;
                }

                /* CAL-NAV-08 — сегодняшняя дата помечается канонической скруглённой
                   прямоугольной плашкой (.doctor-calendar-today-marker, doctor.css). */
                .fc-timegrid-header-link {
                  display: flex;
                  min-height: 2.05rem;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  gap: 0.125rem;
                  padding-block: 0.2rem;
                  text-decoration: none;
                }
                .fc-timegrid-header-link.doctor-calendar-today-marker {
                  gap: 0.1rem;
                  margin-inline: auto;
                  min-height: 2.05rem;
                }
                .fc-timegrid-header-weekday {
                  font-size: 0.6875rem;
                  line-height: 1;
                  color: var(--muted-foreground);
                  text-transform: none;
                }
                .fc-timegrid-header-day {
                  font-size: 0.75rem;
                  line-height: 1;
                  color: var(--foreground);
                }
                .fc-timegrid-header-link.doctor-calendar-today-marker .fc-timegrid-header-weekday,
                .fc-timegrid-header-link.doctor-calendar-today-marker .fc-timegrid-header-day {
                  color: inherit;
                }

                /* §3.11 — мельче цифры дат в месячном виде */
                .fc-daygrid-day-number {
                  font-size: 0.6875rem !important;
                  font-weight: 400 !important;
                  line-height: 1.5 !important;
                }

                @media (max-width: 767px) {
                  .fc-dayGridMonth-view .fc-daygrid-day-frame {
                    min-height: 8.75rem;
                  }
                  .fc-dayGridMonth-view .fc-daygrid-event {
                    margin-inline: 0.125rem;
                    border-radius: 0.25rem;
                  }
                }

                .fc-timegrid-slot-label-cushion,
                .fc-timegrid-axis-cushion {
                  padding-top: 0.125rem;
                  padding-bottom: 0.125rem;
                }
                `}</style>
                  <ScheduleFullCalendarHost
                    calendarRef={calendarRef}
                    key={`${view}:${anchorDate}:${branchId ?? 'all'}:${serviceId ?? 'all'}:${calendarScrollTime}:bounded`}
                    initialView={fcInitialView}
                    views={fcViews}
                    initialDate={anchorDate}
                    timeZone={currentTimeZone}
                    events={calendarEvents}
                    headerToolbar={false}
                    editable={canManageAppointments && view !== 'month'}
                    eventDurationEditable={canManageAppointments && view !== 'month'}
                    eventStartEditable={canManageAppointments && view !== 'month'}
                    // R32: выделение области создаёт запись; клик (без движения) не выделяет,
                    // чтобы остаться сбросом выбора (R24). selectMinDistance разводит клик и drag.
                    selectable={canManageAppointments && view !== 'month'}
                    selectMirror
                    selectMinDistance={5}
                    // #225: keep FC visual slot selection while the create panel is open.
                    // Default unselectAuto=true clears the blue drag highlight on click-elsewhere,
                    // making it look like the slot choice was lost even though the form is prefilled.
                    unselectAuto={false}
                    select={onSelect}
                    nowIndicator
                    dayMaxEvents={view === 'month' && isMobileViewport ? 4 : true}
                    moreLinkContent={(arg) => `+ ещё ${arg.num}`}
                    allDaySlot={false}
                    height={view === 'month' && isMobileViewport ? 'auto' : '100%'}
                    slotMinTime={slotMinTime}
                    slotMaxTime={slotMaxTime}
                    slotLabelContent={(arg) =>
                      formatDoctorCalendarHour(
                        DateTime.fromJSDate(arg.date).setZone(currentTimeZone).hour,
                      )
                    }
                    scrollTime={calendarScrollTime}
                    scrollTimeReset={false}
                    longPressDelay={450}
                    eventLongPressDelay={450}
                    selectLongPressDelay={450}
                    // Клик по заголовку дня → drill-down (D3)
                    navLinks
                    navLinkDayClick={(date) => {
                      const dateKey =
                        DateTime.fromJSDate(date).setZone(currentTimeZone).toISODate() ??
                        anchorDate;
                      drillDownDay(dateKey);
                    }}
                    // CR-1 / Клик по числу в month → drill-down.
                    // Pass dayCellContent only in month view to avoid FullCalendar calling it
                    // (and getting a React element) for timeGrid column headers, which logged a
                    // "1 Issue" console error in the Next.js dev overlay.
                    {...(view === 'month'
                      ? {
                          dayCellContent: (arg: { date: Date }) => {
                            const isToday =
                              DateTime.fromJSDate(arg.date).setZone(currentTimeZone).toISODate() ===
                              DateTime.now().setZone(currentTimeZone).toISODate();
                            return (
                              <Button
                                type="button"
                                variant="ghost"
                                className={cn(
                                  'fc-daygrid-day-number hover:underline cursor-pointer',
                                  isToday && DOCTOR_CALENDAR_TODAY_MARKER_CLASS,
                                )}
                                onClick={() => {
                                  const dateKey =
                                    DateTime.fromJSDate(arg.date)
                                      .setZone(currentTimeZone)
                                      .toISODate() ?? anchorDate;
                                  drillDownDay(dateKey);
                                }}
                              >
                                {arg.date.getDate()}
                              </Button>
                            );
                          },
                        }
                      : {
                          dayHeaderContent: (arg: { date: Date }) => {
                            const dt = DateTime.fromJSDate(arg.date).setZone(currentTimeZone);
                            const isToday =
                              dt.toISODate() ===
                              DateTime.now().setZone(currentTimeZone).toISODate();
                            return (
                              <Button
                                type="button"
                                variant="ghost"
                                className={cn(
                                  'fc-timegrid-header-link',
                                  isToday && DOCTOR_CALENDAR_TODAY_MARKER_CLASS,
                                )}
                                onClick={() => {
                                  const dateKey = dt.toISODate() ?? anchorDate;
                                  drillDownDay(dateKey);
                                }}
                              >
                                <span className="fc-timegrid-header-weekday">
                                  {dt.setLocale('ru').toFormat('ccc')}
                                </span>
                                <span className="fc-timegrid-header-day">{dt.day}</span>
                              </Button>
                            );
                          },
                        })}
                    eventClick={(arg) => {
                      if (Date.now() <= suppressCalendarInteractionUntilRef.current) {
                        suppressCalendarInteractionUntilRef.current = 0;
                        return;
                      }
                      const appointment = arg.event.extendedProps?.appointment as
                        CalendarAppointmentEvent | undefined;
                      if (!appointment) return;
                      openAppointmentDetails(appointment);
                    }}
                    dateClick={(arg) => {
                      if (Date.now() <= suppressCalendarDateClickUntilRef.current) {
                        suppressCalendarDateClickUntilRef.current = 0;
                        return;
                      }
                      if (Date.now() <= suppressCalendarInteractionUntilRef.current) {
                        suppressCalendarInteractionUntilRef.current = 0;
                        return;
                      }
                      if (Date.now() - lastSelectAtRef.current < 500) return;
                      if (filtersPanelOpen) {
                        setFiltersPanelOpen(false);
                        return;
                      }
                      if (selected || showCreatePanel) {
                        closeDraftOrSelectionFromGrid();
                        return;
                      }
                      if (view === 'month') {
                        const dateKey =
                          DateTime.fromJSDate(arg.date).setZone(currentTimeZone).toISODate() ??
                          anchorDate;
                        drillDownDay(dateKey);
                        return;
                      }
                      // CAL-ACTION-01: a single tap selects the slot first; the form is only
                      // reached from «Новая запись» in the menu below. Tapping elsewhere moves
                      // the selection instead of only dismissing the previous one.
                      openGridSelection(arg.date, null);
                    }}
                    eventDrop={onDrop}
                    eventResize={onResize}
                    eventContent={(info) => {
                      const appointment = info.event.extendedProps?.appointment as
                        CalendarAppointmentEvent | undefined;
                      if (appointment) {
                        if (view === 'month') {
                          return (
                            <div className="min-w-0 overflow-hidden px-1 py-0.5 text-left leading-tight">
                              <div className="truncate text-[11px] font-medium">
                                {appointment.patientName?.trim() || eventLastName(appointment)}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                            <div className="truncate font-medium">{eventTitle(appointment)}</div>
                            <div className="truncate opacity-80">
                              {appointmentStatusLabel(appointment.status)}
                            </div>
                          </div>
                        );
                      }
                      // CAL-ACTION-09: фоновые слои (нерабочее время, перерыв) не подписываются
                      // внутри сетки — они читаются только заливкой.
                      if (info.event.display === 'background') return null;
                      return (
                        <div className="truncate px-1 py-0.5 text-[11px]">{info.event.title}</div>
                      );
                    }}
                  />
                  {/* CAL-ACTION-02: the shared doctor popover/menu pattern, anchored to the
                      selection and flipped above or below it by available space. */}
                  {gridSelection ? (
                    <DropdownMenu
                      open={selectionMenuOpen}
                      onOpenChange={(open, eventDetails) => {
                        if (
                          !open &&
                          (eventDetails.reason === 'outside-press' ||
                            eventDetails.reason === 'escape-key')
                        ) {
                          suppressCalendarDateClickUntilRef.current = Date.now() + 500;
                          clearGridSelection();
                          return;
                        }
                        // CAL-ACTION-10: Base UI auto-closes the menu on the same click that runs
                        // a rejected mutation, so this fires in the same tick as
                        // `setSelectionActionError(...)` in `applySelectionScheduleChange`. Do NOT
                        // clear the error here — that raced the close and silently swallowed it,
                        // leaving the doctor with no feedback that nothing was saved. The error is
                        // reset explicitly wherever a fresh attempt actually starts: a new
                        // selection (`openGridSelection`/`clearGridSelection`) or picking «Новая
                        // запись» (`runSelectionAction`).
                        setSelectionMenuOpen(open);
                      }}
                    >
                      <DropdownMenuContent
                        anchor={selectionAnchor}
                        align="center"
                        side="top"
                        sideOffset={8}
                        className="w-auto min-w-[11rem]"
                        data-testid="calendar-selection-menu"
                      >
                        {selectionMenuActions.map((action) => (
                          <DropdownMenuItem
                            key={action}
                            disabled={selectionActionPending}
                            onClick={() => runSelectionAction(action)}
                            data-testid={`calendar-selection-action-${action}`}
                          >
                            {CALENDAR_SELECTION_ACTION_LABELS[action]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="hidden h-full min-h-0 w-full space-y-3 overflow-y-auto xl:block">
          {renderSchedulePeriodBlock('aside')}
          <section className={doctorSectionCardClass}>
            <h2 className={doctorSectionTitleClass}>Фильтры</h2>
            {renderScheduleFilters('flex flex-col gap-1.5', 'w-full')}
          </section>
          {/* Владелец 15.09: «в режиме списка можно скрывать вообще цифры в КПИ» — и сразу следом
              «ты в режиме списка убрал фильтры, а надо было цифры в них». Плитки в ленте остаются
              все пять (это единственный доступ к отбору), уходят только числа и подпись периода:
              и то и другое посчитано по якорному периоду, а лента тянет историю месяцами. Сколько
              найдено — говорит счётчик в блоке фильтров (`renderScheduleSearchControls`). */}
          {showKpi ? (
            <KpiRowTab
              kpis={kpis}
              kpisLoading={kpisLoading}
              selectedKpiFilters={selectedKpiFilters}
              periodLabel={renderMode === 'list' ? '' : kpiPeriod}
              onKpiClick={handleKpiClick}
              valuesHidden={renderMode === 'list'}
            />
          ) : null}
        </aside>
      </div>

      <DoctorModal
        open={openWorkingHoursDialog !== null}
        onClose={() => {
          setOpenWorkingHoursDialog(null);
          clearGridSelection();
        }}
        title="Добавить рабочие часы"
        size="sm"
      >
        {openWorkingHoursDialog ? (
          <div className="space-y-4 p-4">
            <label className="block space-y-2 text-base md:text-sm">
              <span>Филиал</span>
              <Select
                value={openWorkingHoursDialog.branchId ?? undefined}
                onValueChange={(value) =>
                  setOpenWorkingHoursDialog((current) =>
                    current ? { ...current, branchId: value ?? null } : current,
                  )
                }
              >
                <SelectTrigger
                  className="w-full"
                  displayLabel={
                    filters.branches.find((branch) => branch.id === openWorkingHoursDialog.branchId)
                      ?.label ?? 'Выберите филиал'
                  }
                />
                <SelectContent>
                  {filters.branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id} label={branch.label}>
                      {branch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {selectionActionError ? (
              <p className="text-sm text-destructive">{selectionActionError}</p>
            ) : null}

            <DoctorModalFooter>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenWorkingHoursDialog(null);
                  clearGridSelection();
                }}
              >
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectionActionPending || !openWorkingHoursDialog.branchId}
                onClick={() => {
                  if (!openWorkingHoursDialog.branchId) return;
                  void applySelectionScheduleChange('open-for-booking', {
                    branchId: openWorkingHoursDialog.branchId,
                  });
                }}
              >
                Сохранить
              </Button>
            </DoctorModalFooter>
          </div>
        ) : null}
      </DoctorModal>

      <DoctorModal
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        title="Перейти к дате"
        size="content"
      >
        <DayPicker
          mode="single"
          locale={ru}
          weekStartsOn={1}
          selected={DateTime.fromISO(mobileVisibleDate, {
            zone: currentTimeZone,
          }).toJSDate()}
          defaultMonth={DateTime.fromISO(mobileVisibleDate, {
            zone: currentTimeZone,
          }).toJSDate()}
          onSelect={(date) => {
            if (date) jumpToDate(date);
          }}
          className="doctor-day-picker mx-auto p-3"
        />
      </DoctorModal>

      <DoctorModal
        open={filtersPanelOpen && !isWideScheduleLayout}
        onClose={() => setFiltersPanelOpen(false)}
        title="Фильтры"
        size="lg"
        desktopPresentation="right-sheet"
        bodyClassName="p-4"
      >
        <div id="schedule-filters-panel" className="flex flex-col gap-3">
          {/* Владелец 15.09: «в модалке мобильного пусть будет так же две верхние строки — выбор
              периода на экране и режима» — блок «Период» (режим + дата одной карточкой, «слей
              блоки период и дата в один») показывается и на мобильном, раньше стоял только для
              планшета. Поиск — последняя строка блока фильтров («поиск влей в фильтры»). */}
          {renderSchedulePeriodBlock('modal')}
          {renderScheduleFilters('flex flex-col gap-1.5', 'w-full')}
          {/* То же, что и в `<aside>`: в ленте плитки остаются отбором, без чисел и без подписи
              периода (владелец 15.09: «ты в режиме списка убрал фильтры — а надо было цифры в
              них»). Подробности — у `valuesHidden`. */}
          {showKpi ? (
            <KpiRowTab
              kpis={kpis}
              kpisLoading={kpisLoading}
              selectedKpiFilters={selectedKpiFilters}
              periodLabel={renderMode === 'list' ? '' : kpiPeriod}
              onKpiClick={handleKpiClick}
              valuesHidden={renderMode === 'list'}
            />
          ) : null}
        </div>
      </DoctorModal>

      {!isMobileViewport ? (
        <DoctorModal
          open={eventPanelOpen}
          onClose={clearDraftAndPanel}
          onRightSheetOutsidePress={() => {
            suppressCalendarDateClickUntilRef.current = Date.now() + 1000;
          }}
          title={eventPanelTitle}
          size="lg"
          desktopPresentation="right-sheet"
          bodyClassName="p-4"
        >
          {eventPanelNode}
        </DoctorModal>
      ) : null}

      {isMobileViewport ? (
        <DoctorModal
          open={eventPanelOpen}
          onClose={clearDraftAndPanel}
          title={eventPanelTitle}
          size="lg"
        >
          {eventPanelNode}
        </DoctorModal>
      ) : null}

      <DoctorCalendarRescheduleDialog
        pending={pendingReschedule}
        timeZone={currentTimeZone}
        comment={rescheduleComment}
        busy={rescheduleBusy}
        error={rescheduleError}
        onCommentChange={setRescheduleComment}
        onConfirm={confirmRescheduleConfirm}
        onCancel={cancelRescheduleConfirm}
      />

    </div>
  );
}
