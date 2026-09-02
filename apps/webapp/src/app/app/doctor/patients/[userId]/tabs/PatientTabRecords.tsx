'use client';

/**
 * PatientTabRecords — Wave 3: appointment history, KPIs, upcoming, membership.
 * Data: real from GET /api/doctor/patients/[userId]/appointments (client-side fetch).
 * A failed fetch renders no visits and says the load failed — never a stand-in. This tab used to
 * substitute three hardcoded demo visits on error, drawn in the patient's own chart.
 * «Оформить визит»: dispatches custom event "patient:open-tab" with {tab:"karta"} — consumed by
 *   PatientCardClient (lines 140-141) to switch to the Карта tab.
 * Note: booking-reputation & merge removed from this tab per owner decision 2026-06-14.
 */

import { useEffect, useMemo, useState } from 'react';
import { BadgePlus, CalendarPlus, ChevronDown, ChevronRight, Eye } from 'lucide-react';
import type { PatientAppointmentItem, PatientCardHeader } from '@/modules/doctor-clients/ports';
import { MembershipCardHeader } from '@/shared/ui/doctor/MembershipCardHeader';
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorSectionItemClass,
  doctorSectionItemUrgentClass,
  doctorPageStackClass,
  doctorInteractiveSurfaceButtonClass,
  doctorMetricValueClass,
  doctorSecondaryListTextClass,
  doctorStatCardInteractiveClass,
  doctorStatCardShellClass,
} from '@/shared/ui/doctor/doctorVisual';
import { DoctorStatCard } from '@/app/app/doctor/analytics/clients/DoctorStatCard';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorModalSummaryBar } from '@/shared/ui/doctor/DoctorModalSummaryBar';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import {
  formatPatientPackageLongLabel,
  formatPatientPackageShortLabel,
} from '@/modules/memberships/display';
import { DoctorNewAppointmentModal } from '@/app/app/doctor/calendar/DoctorNewAppointmentModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppointmentStatus =
  | 'completed' // состоялась
  | 'rescheduled' // перенос
  | 'canceled' // отмена
  | 'no_show' // неявка (маппинг от canceled — не используется в реальных данных)
  | 'upcoming'; // предстоящая

/** Нормализованный элемент для рендера — общий формат для real + mock данных. */
interface DisplayAppointment {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  location: string;
  service: string;
  status: AppointmentStatus;
  rescheduledToDate?: string;
  hasVisitRecord?: boolean;
  cancelReason?: string;
  durationMin?: number;
  /** Запись списана с абонемента (be_appointments.package_usage_ref IS NOT NULL). */
  isPackage?: boolean | null;
  patientPackageId?: string | null;
  packageTitle?: string | null;
  packageDisplayNumber?: number | null;
  isLateCancellation?: boolean;
}

/** Маппинг PatientAppointmentItem → DisplayAppointment. */
function mapRealToDisplay(item: PatientAppointmentItem): DisplayAppointment {
  const dt = item.dateTime ? new Date(item.dateTime) : null;
  const date = dt
    ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    : '';
  const time = dt
    ? `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
    : '';
  return {
    id: item.id,
    date,
    time,
    location: item.location ?? '',
    service: item.serviceName ?? 'Запись',
    status: item.status === 'rescheduled' ? 'rescheduled' : item.status,
    durationMin: item.durationMin ?? undefined,
    hasVisitRecord: item.hasVisitRecord === true,
    isPackage: item.isPackage ?? null,
    patientPackageId: item.patientPackageId ?? null,
    packageTitle: item.packageTitle ?? null,
    packageDisplayNumber: item.packageDisplayNumber ?? null,
    isLateCancellation: item.isLateCancellation === true,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(isoOrSlash: string): string {
  // Accepts YYYY-MM-DD → DD.MM.YYYY
  const parts = isoOrSlash.split('-');
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return isoOrSlash;
}

function fmtWeekday(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short' })
    .replace('.', '');
}

function formatNextAppointment(appointment: DisplayAppointment | undefined): string | undefined {
  if (!appointment?.date) return undefined;
  return `След ${fmtDate(appointment.date).slice(0, 5)}`;
}

function formatMoney(amountMinor: number | null | undefined, currency: string | null | undefined) {
  if (amountMinor == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency || 'RUB',
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

/** Dispatch custom event to switch PatientCardClient to a different tab. */
function openTab(tabId: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('patient:open-tab', { detail: { tab: tabId } }));
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusChip({
  status,
  rescheduledToDate,
}: {
  status: AppointmentStatus;
  rescheduledToDate?: string;
}) {
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-[#e7f4ec] text-[#1f7a45]">
        состоялась
      </span>
    );
  }
  if (status === 'rescheduled') {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-[#fdf3dd] text-[#9a6b15]">
        перенос{rescheduledToDate ? ` → ${rescheduledToDate}` : ''}
      </span>
    );
  }
  if (status === 'no_show') {
    return (
      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-destructive/10 text-destructive">
        отмена ⚠
      </span>
    );
  }
  if (status === 'upcoming') {
    return (
      <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-primary">
        запланирована
      </span>
    );
  }
  // canceled
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-destructive/10 text-destructive">
      отмена
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/** Appointment prefill data passed to the visit creation callback. */
export type AppointmentPrefill = {
  id: string;
  location?: string;
  service?: string;
  durationMin?: number;
};

type Props = {
  userId: string;
  header?: PatientCardHeader;
  onCreateVisitFromAppointment?: (prefill: AppointmentPrefill) => void;
  initialAppointments?: PatientAppointmentItem[] | null;
  /** SSR-provided patient packages. When present, skips the MembershipPanel client fetch. */
  initialPackages?: ApiPackage[] | null;
  membershipsVisible?: boolean;
  membershipMutationsAllowed?: boolean;
  /** SSR-provided payments summary. When present, skips the PaymentsPanel initial fetch. */
  initialPaymentsSummary?: { payments: PaymentItem[]; totalPaidMinor: number } | null;
  compositionMode?: 'master';
  onOpenVisitNotes?: (appointmentId: string) => void;
  onOpenMembershipConfiguration?: () => void;
};

export function PatientTabRecords({
  userId,
  header,
  onCreateVisitFromAppointment,
  initialAppointments,
  initialPackages,
  membershipsVisible = true,
  membershipMutationsAllowed = true,
  initialPaymentsSummary,
  compositionMode,
  onOpenVisitNotes,
  onOpenMembershipConfiguration,
}: Props) {
  const [cancelsPanelOpen, setCancelsPanelOpen] = useState(false);
  const [highlightedPackageId, setHighlightedPackageId] = useState<string | null>(null);
  const [visitsModalOpen, setVisitsModalOpen] = useState(false);
  const [newAppointmentModalOpen, setNewAppointmentModalOpen] = useState(false);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [membershipSessions, setMembershipSessions] = useState<PackageSession[] | null>(null);
  const [membershipSessionsError, setMembershipSessionsError] = useState(false);

  // Real appointments fetch. Track the userId the loaded state belongs to so we
  // can derive «loading» when the prop changes — instead of resetting state
  // synchronously inside the effect (which triggers cascading renders).
  const [allAppointments, setAllAppointments] = useState<DisplayAppointment[] | null>(() =>
    initialAppointments != null ? initialAppointments.map(mapRealToDisplay) : null,
  );
  const [fetchError, setFetchError] = useState(false);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() =>
    initialAppointments != null ? userId : null,
  );

  useEffect(() => {
    if (initialAppointments != null && loadedUserId === userId) {
      return;
    }
    let active = true;
    fetch(`/api/doctor/patients/${userId}/appointments`)
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<{ appointments: PatientAppointmentItem[] }>;
      })
      .then((data) => {
        if (!active) return;
        setAllAppointments(data.appointments.map(mapRealToDisplay));
        setFetchError(false);
        setLoadedUserId(userId);
      })
      .catch(() => {
        if (!active) return;
        setFetchError(true);
        setLoadedUserId(userId);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Stale = loaded state belongs to a previous userId → treat as loading.
  const isStale = loadedUserId !== userId;
  // Loading → empty (spinner shown); error → empty + the error banner below; loaded → real data.
  //
  // A failed load renders NOTHING, never a stand-in. This tab used to fall back to three hardcoded
  // demo visits ("Студия на Лесной", "Тренировка ЛФК", dates in 2026) drawn in the patient's own
  // chart, and the visit/cancellation/reschedule counters underneath were computed from them
  // whenever `header` was absent — so a refused read produced invented clinical history carrying
  // real-looking totals. "Загрузить не удалось" and "записей нет" stay distinguishable through the
  // separate `fetchError` flag, which the banner keys off; an empty `allAppointments` from a
  // successful read still shows "Записей пока нет."
  const isLoading = isStale || (allAppointments === null && !fetchError);
  const displayList: DisplayAppointment[] = isStale || fetchError ? [] : (allAppointments ?? []);

  const upcomingList = displayList.filter((a) => a.status === 'upcoming');
  const nextAppointment = [...upcomingList].sort((a, b) =>
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`),
  )[0];
  const historyList = displayList.filter((a) => a.status !== 'upcoming');

  // KPI: real values from header where available
  const completedCount =
    header?.totalVisits ?? historyList.filter((a) => a.status === 'completed').length;
  const cancelsCount =
    header?.cancellationsCount ??
    historyList.filter((a) => a.status === 'canceled' || a.status === 'no_show').length;
  const reschedulesCount =
    header?.reschedulesCount ?? historyList.filter((a) => a.status === 'rescheduled').length;
  const totalRecords = completedCount + cancelsCount + reschedulesCount;
  const firstVisitDate = header?.firstVisitDate;
  const lateCancellationsCount = historyList.filter((a) => a.isLateCancellation).length;

  const activePackages = useMemo(
    () => (initialPackages ?? []).filter((pkg) => isActivePackageStatus(pkg.status)),
    [initialPackages],
  );
  const activePackageSummaries = activePackages.map((pkg) => {
    const totals = packageTotals(pkg);
    const startedLinkedAppointments = displayList.filter((appointment) => {
      if (appointment.patientPackageId !== pkg.id || !appointment.isPackage) return false;
      const startsAt = new Date(`${appointment.date}T${appointment.time || '00:00'}`).getTime();
      return Number.isFinite(startsAt) && startsAt <= Date.now();
    }).length;
    return {
      pkg,
      total: totals.totalSessions,
      used: Math.max(
        startedLinkedAppointments,
        Math.max(0, totals.totalSessions - totals.remainingSessions),
      ),
    };
  });
  const membershipTotals = activePackageSummaries.reduce(
    (result, summary) => ({
      total: result.total + summary.total,
      used: result.used + summary.used,
    }),
    { total: 0, used: 0 },
  );
  const membershipValidUntil = activePackages
    .map((pkg) => pkg.validUntil)
    .filter((value): value is string => Boolean(value))
    .sort()[0];

  useEffect(() => {
    if (!membershipModalOpen || activePackages.length === 0) return;
    let active = true;
    setMembershipSessions(null);
    setMembershipSessionsError(false);
    void Promise.all(
      activePackages.map(async (pkg) => {
        const response = await fetch(
          `/api/doctor/booking-engine/patient-packages/${pkg.id}/sessions?includePast=true`,
          { credentials: 'include' },
        );
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = (await response.json()) as { sessions?: PackageSession[] };
        return (data.sessions ?? []).filter((session) => {
          if (session.linkage === 'consumed' || session.linkage === 'penalty') return true;
          return (
            session.linkage === 'reserved' && new Date(session.startsAt).getTime() <= Date.now()
          );
        });
      }),
    )
      .then((groups) => {
        if (!active) return;
        setMembershipSessions(groups.flat().sort((a, b) => b.startsAt.localeCompare(a.startsAt)));
      })
      .catch(() => {
        if (!active) return;
        setMembershipSessions([]);
        setMembershipSessionsError(true);
      });
    return () => {
      active = false;
    };
  }, [membershipModalOpen, activePackages]);

  const hasNoShows = historyList.some((a) => a.status === 'no_show');
  const cancelsHistory = historyList.filter(
    (a) => a.status === 'canceled' || a.status === 'no_show',
  );

  if (compositionMode === 'master') {
    return (
      <section aria-label="Записи">
        <div className="grid grid-cols-2 gap-2">
          <DoctorStatCard
            id="patient-overview-visits"
            title="Визитов"
            value={completedCount}
            valuePlacement="inline"
            hint={formatNextAppointment(nextAppointment)}
            hintClassName={doctorSecondaryListTextClass}
            onClick={() => setVisitsModalOpen(true)}
            actionIcon={<CalendarPlus className="size-5" aria-hidden />}
            actionLabel="Добавить запись"
            onActionClick={() => setNewAppointmentModalOpen(true)}
            className="border-primary/30"
          />
          <DoctorStatCard
            id="patient-overview-membership"
            title={activePackages.length > 0 ? 'Абонемент' : 'Без абонемента'}
            value={
              activePackages.length > 0
                ? `${membershipTotals.used} из ${membershipTotals.total}`
                : ''
            }
            hint={
              membershipValidUntil ? `до ${fmtDate(membershipValidUntil.slice(0, 10))}` : undefined
            }
            onClick={() => setMembershipModalOpen(true)}
            actionIcon={<BadgePlus className="size-5" aria-hidden />}
            actionLabel="Добавить абонемент"
            onActionClick={
              membershipsVisible && membershipMutationsAllowed
                ? onOpenMembershipConfiguration
                : undefined
            }
            className="border-primary/30"
          />
        </div>

        <DoctorNewAppointmentModal
          open={newAppointmentModalOpen}
          onClose={() => setNewAppointmentModalOpen(false)}
          patient={{
            id: header?.identity.userId ?? userId,
            displayName: header?.identity.displayName ?? '',
            firstName: header?.identity.firstName ?? null,
            lastName: header?.identity.lastName ?? null,
            patronymic: header?.identity.patronymic ?? null,
            phone: header?.identity.phone ?? null,
            email: header?.identity.email ?? null,
          }}
        />

        <DoctorModal
          open={visitsModalOpen}
          onClose={() => setVisitsModalOpen(false)}
          title="Визиты"
          size="lg"
          bodyVariant="list"
          desktopPresentation="right-sheet"
        >
          <DoctorModalSummaryBar className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <span>Отмен {cancelsCount}</span>
            <span>Переносов {reschedulesCount}</span>
            <span>Поздних отмен {lateCancellationsCount}</span>
            <span>Будущих {upcomingList.length}</span>
          </DoctorModalSummaryBar>
          {isLoading ? (
            <p className="animate-pulse px-4 py-2 text-sm text-muted-foreground">
              Загрузка записей…
            </p>
          ) : fetchError ? (
            <p className="px-4 py-2 text-sm text-destructive">Не удалось загрузить записи.</p>
          ) : displayList.length === 0 ? (
            <DoctorEmptyState>Визитов нет</DoctorEmptyState>
          ) : (
            <DoctorDnaFlatList>
              {displayList.map((appt) => (
                <li key={appt.id} className={`${doctorDnaFlatListRowClass} justify-between`}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`${doctorDnaFlatListPrimaryClass} truncate tabular-nums`}>
                      {fmtDate(appt.date)} · {appt.time}
                    </span>
                    <span className={`${doctorDnaFlatListMetaClass} truncate`}>
                      {appt.service}
                      {appt.durationMin ? ` · ${appt.durationMin} мин` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusChip status={appt.status} rescheduledToDate={appt.rescheduledToDate} />
                    {appt.status === 'completed' && appt.hasVisitRecord ? (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => onOpenVisitNotes?.(appt.id)}
                      >
                        Открыть
                      </Button>
                    ) : null}
                    {appt.status === 'completed' && !appt.hasVisitRecord ? (
                      <Button
                        type="button"
                        size="xs"
                        onClick={() =>
                          onCreateVisitFromAppointment?.({
                            id: appt.id,
                            location: appt.location || undefined,
                            service: appt.service || undefined,
                            durationMin: appt.durationMin,
                          })
                        }
                      >
                        Оформить
                      </Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </DoctorDnaFlatList>
          )}
        </DoctorModal>

        <DoctorModal
          open={membershipModalOpen}
          onClose={() => setMembershipModalOpen(false)}
          title="Абонемент"
          size="lg"
          bodyVariant="list"
          desktopPresentation="right-sheet"
        >
          {activePackages.length > 0 ? (
            <DoctorModalSummaryBar>
              {activePackageSummaries.map(({ pkg, used, total }) => (
                <div
                  key={pkg.id}
                  className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4"
                >
                  <span className="font-medium">{pkg.title}</span>
                  <span>
                    Использовано {used} из {total}
                  </span>
                  <span>
                    {formatMoney(
                      pkg.paidAmountMinor ?? pkg.priceMinor,
                      pkg.paidCurrency ?? pkg.currency,
                    )}
                  </span>
                  <span>{pkg.paymentIntentId || pkg.paymentRef ? 'Онлайн' : 'Наличные'}</span>
                  <span>
                    {pkg.soldAt || pkg.createdAt
                      ? `Куплен ${fmtDate((pkg.soldAt ?? pkg.createdAt ?? '').slice(0, 10))}`
                      : 'Дата покупки —'}
                  </span>
                  <span className="col-span-2 text-muted-foreground sm:col-span-4">
                    {pkg.validUntil
                      ? `Действует до ${fmtDate(pkg.validUntil.slice(0, 10))}`
                      : 'Без ограничения срока'}
                  </span>
                </div>
              ))}
            </DoctorModalSummaryBar>
          ) : null}
          {activePackages.length === 0 ? (
            <DoctorEmptyState>Активного абонемента нет</DoctorEmptyState>
          ) : membershipSessions === null ? (
            <DoctorPanelLoading className="min-h-32" label="Загрузка сеансов" />
          ) : membershipSessionsError ? (
            <p className="px-4 py-3 text-sm text-destructive">Не удалось загрузить сеансы.</p>
          ) : membershipSessions.length === 0 ? (
            <DoctorEmptyState>Списанных сеансов нет</DoctorEmptyState>
          ) : (
            <DoctorDnaFlatList>
              {membershipSessions.map((session) => {
                const startsAt = new Date(session.startsAt);
                return (
                  <li
                    key={`${session.appointmentId}-${session.startsAt}`}
                    className={doctorDnaFlatListRowClass}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={`${doctorDnaFlatListPrimaryClass} truncate`}>
                        {session.serviceTitle}
                      </span>
                      <span className={`${doctorDnaFlatListMetaClass} truncate`}>
                        {[
                          session.branchTitle,
                          session.linkage === 'penalty' ? 'Списано за отмену' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className={`${doctorDnaFlatListMetaClass} shrink-0 tabular-nums`}>
                      {fmtDate(session.startsAt.slice(0, 10))} ·{' '}
                      {startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                );
              })}
            </DoctorDnaFlatList>
          )}
        </DoctorModal>
      </section>
    );
  }

  return (
    <div className={cn(doctorPageStackClass)}>
      {/* ================================================================
          KPI ROW — 4 stat cards
      ================================================================ */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Всего записей */}
        <DoctorStatCard
          id="patient-records-total"
          title="Всего записей"
          value={totalRecords}
          hint={
            firstVisitDate
              ? `с ${(() => {
                  const p = firstVisitDate.split('-');
                  return p.length === 3 ? `${p[1]}.${p[0]}` : firstVisitDate;
                })()}`
              : 'с 09.2025'
          }
        />

        {/* Состоялись */}
        <DoctorStatCard
          id="patient-records-completed"
          title="Состоялись"
          value={completedCount}
          hint="посещений за всё время"
        />

        {/* Отмены — clickable, highlights when there are no-shows */}
        <DoctorStatCard
          id="patient-records-cancellations"
          title="Отмены"
          value={
            <>
              {cancelsCount}
              {hasNoShows && <span className="ml-1 font-black text-destructive">!</span>}
            </>
          }
          hint={hasNoShows ? 'есть неявка · детали ↓' : 'за всё время'}
          tone={hasNoShows ? 'warning' : 'neutral'}
          onClick={() => setCancelsPanelOpen((v) => !v)}
        />

        {/* Переносы */}
        <DoctorStatCard
          id="patient-records-reschedules"
          title="Переносы"
          value={reschedulesCount}
          hint="за всё время"
        />
      </div>

      {/* ================================================================
          CANCELS DETAIL PANEL — opens on click of Отмены card
      ================================================================ */}
      {cancelsPanelOpen && cancelsHistory.length > 0 && (
        <div className={cn(doctorSectionCardClass, 'border-destructive/30')}>
          <p
            className={cn(
              doctorSectionTitleClass,
              'text-xs uppercase tracking-wide text-muted-foreground',
            )}
          >
            Отмены · детали
          </p>
          <div className="flex flex-col gap-1.5">
            {cancelsHistory.map((a) => (
              <div
                key={a.id}
                className={cn(
                  doctorSectionItemClass,
                  a.status === 'no_show' ? doctorSectionItemUrgentClass : 'bg-muted/10',
                  'flex items-center gap-3 text-xs',
                )}
              >
                <span className="font-semibold text-foreground whitespace-nowrap">
                  {fmtDate(a.date)}
                </span>
                <span className="text-muted-foreground flex-1 min-w-0">
                  {a.status === 'canceled'
                    ? `отменена клиентом · причина: ${a.cancelReason ?? '—'}`
                    : `отменена · причина: клиент не пришёл`}
                </span>
                {a.status === 'no_show' && (
                  <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive whitespace-nowrap flex-none">
                    ⚠ неявка
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className={cn(doctorSectionSubtitleClass, 'text-[11px] leading-relaxed')}>
            Неявка — не отдельный статус, а причина отмены.
          </p>
        </div>
      )}

      {/* ================================================================
          TWO-COLUMN: История записей | Предстоящие + Абонемент
      ================================================================ */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.25fr_1fr] md:items-start">
        {/* LEFT: Визиты */}
        <div className={doctorSectionCardClass}>
          <div className="flex items-center justify-between gap-2">
            <p className={doctorSectionTitleClass}>Визиты</p>
            <span className={cn(doctorSectionSubtitleClass, 'text-[11px]')}>
              новые сверху · прокручивается
            </span>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-0.5">
            {isLoading && (
              <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка записей…</p>
            )}
            {fetchError && (
              <p className="text-xs text-destructive py-1">
                Не удалось загрузить записи. Это сбой загрузки, а не отсутствие визитов.
              </p>
            )}
            {!isLoading && !fetchError && historyList.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Записей пока нет.</p>
            )}
            {historyList.map((appt) => (
              <div
                key={appt.id}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg border bg-background px-2.5 py-2 text-xs',
                  highlightedPackageId && appt.patientPackageId === highlightedPackageId
                    ? 'border-violet-500/60'
                    : 'border-border/70',
                )}
              >
                {/* Date */}
                <span className="font-semibold text-foreground flex-none w-[72px]">
                  {fmtDate(appt.date)}
                </span>
                {/* Time */}
                <span className="text-muted-foreground flex-none w-[38px]">{appt.time}</span>
                {/* Location · Service */}
                <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-foreground/80">
                  {appt.location} · {appt.service}
                </span>
                {/* Package badge */}
                {appt.isPackage ? (
                  <span
                    className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900 whitespace-nowrap flex-none"
                    title={appt.packageTitle ?? undefined}
                  >
                    {formatPatientPackageShortLabel(appt.packageDisplayNumber)}
                  </span>
                ) : null}
                {/* Status chip */}
                <StatusChip status={appt.status} rescheduledToDate={appt.rescheduledToDate} />
                {/* Action */}
                {appt.status === 'completed' && !appt.hasVisitRecord && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (onCreateVisitFromAppointment) {
                        onCreateVisitFromAppointment({
                          id: appt.id,
                          location: appt.location || undefined,
                          service: appt.service || undefined,
                          durationMin: appt.durationMin,
                        });
                      } else {
                        openTab('karta');
                      }
                    }}
                    className="rounded-md bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/25 whitespace-nowrap flex-none"
                  >
                    Оформить визит
                  </Button>
                )}
                {appt.status === 'completed' && appt.hasVisitRecord && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onOpenVisitNotes?.(appt.id);
                      if (!onOpenVisitNotes) openTab('karta');
                    }}
                    className="text-[11px] text-muted-foreground whitespace-nowrap flex-none hover:text-primary"
                  >
                    Открыть заметки
                  </Button>
                )}
              </div>
            ))}
          </div>

          <p className={cn(doctorSectionSubtitleClass, 'text-[11px] leading-relaxed')}>
            У состоявшейся записи — либо ссылка «визит → » (Карта, визит раскрыт), либо кнопка
            «Оформить визит», если визит не оформлен. Создание новой записи — в Расписании.
          </p>
        </div>

        {/* RIGHT column: Предстоящие + Абонемент */}
        <div className="flex flex-col gap-3">
          {/* Предстоящие */}
          <div className={doctorSectionCardClass}>
            <div className="flex items-center gap-2">
              <p className={doctorSectionTitleClass}>Предстоящие</p>
              {upcomingList.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {upcomingList.length}
                </span>
              )}
            </div>

            {fetchError ? (
              <p className="text-xs text-destructive py-1">
                Не удалось загрузить записи. Это сбой загрузки, а не отсутствие визитов.
              </p>
            ) : upcomingList.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Нет предстоящих записей</p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcomingList.map((appt) => (
                  <div
                    key={appt.id}
                    className={cn(
                      'rounded-xl border bg-primary/5 p-3',
                      highlightedPackageId && appt.patientPackageId === highlightedPackageId
                        ? 'border-violet-500/60'
                        : 'border-primary/30',
                    )}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-foreground">
                        {appt.date ? `${fmtWeekday(appt.date)} ${fmtDate(appt.date)}` : '—'}
                        {appt.time ? ` · ${appt.time}` : ''}
                      </span>
                      <span className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium text-primary border border-primary/20">
                        подтверждена
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[appt.location, appt.service].filter(Boolean).join(' · ')}
                      {appt.durationMin ? ` · ${appt.durationMin} мин` : ''}
                    </p>
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {['Перенести', 'Отменить', 'Комментарий'].map((label) => (
                        <Button
                          key={label}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => undefined}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Абонемент */}
          {membershipsVisible ? (
            <MembershipPanel
              userId={userId}
              initialPackages={initialPackages}
              highlightedPackageId={highlightedPackageId}
              onToggleHighlight={(packageId) => {
                setHighlightedPackageId((current) => (current === packageId ? null : packageId));
              }}
            />
          ) : null}
        </div>
      </div>

      {/* ================================================================
          ФИНАНСЫ — Платежи (moved from Учётка S2.5)
      ================================================================ */}
      <PaymentsPanel userId={userId} initialPaymentsSummary={initialPaymentsSummary} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Membership panel — real data from be_patient_packages
// ---------------------------------------------------------------------------

type ApiPackageItemBalance = {
  quantityInitial: number;
  remaining: number;
  serviceTitle?: string | null;
  displayRemaining?: number | null;
};
export type ApiPackage = {
  id: string;
  displayNumber?: number | null;
  title: string;
  status: string;
  soldAt?: string | null;
  validFrom?: string | null;
  validUntil: string | null;
  createdAt?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  paidAmountMinor?: number | null;
  paidCurrency?: string | null;
  paymentIntentId?: string | null;
  paymentRef?: string | null;
  balance?: { items: ApiPackageItemBalance[] } | null;
  /** Items with service info from PatientPackageRecord.items. */
  items?: Array<{ serviceId: string; quantityInitial: number; sortOrder: number }> | null;
};

const isActivePackageStatus = (s: string) => s === 'active' || s === 'activated';

type ConsumeSession = {
  startsAt: string;
};

type PackageSession = {
  appointmentId: string;
  linkage: string;
  startsAt: string;
  branchTitle?: string | null;
  serviceTitle: string;
  isPast?: boolean;
};

type PackageSessionState = {
  sessions: PackageSession[] | null;
  loading: boolean;
};

function packageTotals(pkg: ApiPackage): {
  balanceItems: ApiPackageItemBalance[];
  totalSessions: number;
  remainingSessions: number;
} {
  const balanceItems = pkg.balance?.items ?? [];
  return {
    balanceItems,
    totalSessions: balanceItems.reduce((s, it) => s + (it.quantityInitial ?? 0), 0),
    remainingSessions: balanceItems.reduce(
      (s, it) => s + (it.displayRemaining ?? it.remaining ?? 0),
      0,
    ),
  };
}

function isClosedByConsumedPastSessions(
  pkg: ApiPackage,
  sessions: PackageSession[] | null,
): boolean {
  if (!sessions) return false;
  const { totalSessions } = packageTotals(pkg);
  if (totalSessions <= 0) return false;
  const consumedPastCount = sessions.filter(
    (s) => s.linkage === 'consumed' && s.isPast === true,
  ).length;
  return consumedPastCount >= totalSessions;
}

function MembershipPanel({
  userId,
  initialPackages,
  highlightedPackageId,
  onToggleHighlight,
  onOpenConfiguration,
  mutationsAllowed = true,
}: {
  userId: string;
  /** SSR-provided packages. When present, skips the initial client fetch. */
  initialPackages?: ApiPackage[] | null;
  highlightedPackageId: string | null;
  onToggleHighlight: (packageId: string) => void;
  onOpenConfiguration?: () => void;
  mutationsAllowed?: boolean;
}) {
  const [openHistoryPackageIds, setOpenHistoryPackageIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [packages, setPackages] = useState<ApiPackage[] | null>(() => initialPackages ?? null);
  const [error, setError] = useState(false);
  const [packageSessions, setPackageSessions] = useState<Record<string, PackageSessionState>>({});

  useEffect(() => {
    // Skip initial fetch when SSR data provided.
    if (initialPackages != null) return;
    let active = true;
    fetch(`/api/doctor/booking-engine/patient-packages?platformUserId=${userId}`, {
      credentials: 'include',
    })
      .then((r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json() as Promise<{ ok: boolean; packages: ApiPackage[] }>;
      })
      .then((d) => {
        if (!active) return;
        setPackages(d.packages ?? []);
      })
      .catch(() => {
        if (!active) return;
        setError(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    let active = true;
    const loadPackages = () => {
      fetch(`/api/doctor/booking-engine/patient-packages?platformUserId=${userId}`, {
        credentials: 'include',
      })
        .then((r) => {
          if (!r.ok) throw new Error(`status ${r.status}`);
          return r.json() as Promise<{ ok: boolean; packages: ApiPackage[] }>;
        })
        .then((data) => {
          if (!active) return;
          setPackages(data.packages ?? []);
          setError(false);
        })
        .catch(() => {
          if (active) setError(true);
        });
    };
    window.addEventListener('patient:packages-changed', loadPackages);
    return () => {
      active = false;
      window.removeEventListener('patient:packages-changed', loadPackages);
    };
  }, [userId]);

  const classifiedPackages = useMemo(() => {
    const source = packages ?? [];
    const active: ApiPackage[] = [];
    const history: ApiPackage[] = [];
    for (const pkg of source) {
      const sessions = packageSessions[pkg.id]?.sessions ?? null;
      const closedBySessions = isClosedByConsumedPastSessions(pkg, sessions);
      if (isActivePackageStatus(pkg.status) && !closedBySessions) {
        active.push(pkg);
      } else {
        history.push(pkg);
      }
    }
    return { active, history };
  }, [packages, packageSessions]);

  // Fetch sessions for every package: active cards need consume dates, and active packages move
  // into history only when all sessions are linked to completed past appointments.
  useEffect(() => {
    const rows = packages ?? [];
    if (rows.length === 0) {
      setPackageSessions({});
      return;
    }
    let alive = true;
    setPackageSessions((prev) => {
      const next: Record<string, PackageSessionState> = {};
      for (const pkg of rows) {
        next[pkg.id] = prev[pkg.id]?.sessions ? prev[pkg.id]! : { sessions: null, loading: true };
      }
      return next;
    });
    void Promise.all(
      rows.map(async (pkg) => {
        const response = await fetch(
          `/api/doctor/booking-engine/patient-packages/${pkg.id}/sessions?includePast=true`,
          { credentials: 'include' },
        ).catch(() => null);
        const data = response?.ok
          ? ((await response.json().catch(() => null)) as { sessions?: PackageSession[] } | null)
          : null;
        return { packageId: pkg.id, sessions: data?.sessions ?? [] };
      }),
    ).then((results) => {
      if (!alive) return;
      const next: Record<string, PackageSessionState> = {};
      for (const result of results) {
        next[result.packageId] = { sessions: result.sessions, loading: false };
      }
      setPackageSessions(next);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages?.map((pkg) => pkg.id).join('|') ?? '']);

  function toggleHistoryPackage(packageId: string) {
    setOpenHistoryPackageIds((prev) => {
      const next = new Set(prev);
      if (next.has(packageId)) next.delete(packageId);
      else next.add(packageId);
      return next;
    });
  }

  async function recalculate(packageId: string) {
    const response = await fetch(
      `/api/doctor/booking-engine/patient-packages/${packageId}/recalc`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    ).catch(() => null);
    if (response?.ok) {
      window.dispatchEvent(new CustomEvent('patient:packages-changed'));
    }
  }

  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2">
        <p className={doctorSectionTitleClass}>Абонементы</p>
        {classifiedPackages.active.length > 0 ? (
          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium bg-[#e7f4ec] text-[#1f7a45]">
            активных {classifiedPackages.active.length}
          </span>
        ) : null}
        {mutationsAllowed ? (
          <Button type="button" size="xs" className="ml-auto" onClick={onOpenConfiguration}>
            Добавить абонемент
          </Button>
        ) : null}
      </div>

      {packages === null && !error ? (
        <p className={cn(doctorSectionSubtitleClass, 'text-xs')}>Загрузка…</p>
      ) : error ? (
        <p className={cn(doctorSectionSubtitleClass, 'text-xs')}>
          Не удалось загрузить абонементы.
        </p>
      ) : classifiedPackages.active.length > 0 ? (
        <div className="flex flex-col gap-2">
          {classifiedPackages.active.map((pkg) => {
            const { balanceItems, totalSessions, remainingSessions } = packageTotals(pkg);
            const sessionState = packageSessions[pkg.id];
            const consumeDates: ConsumeSession[] | null = sessionState?.sessions
              ? sessionState.sessions
                  .filter((s) => s.linkage === 'consumed')
                  .map((s) => ({ startsAt: s.startsAt }))
              : null;
            return (
              <div
                key={pkg.id}
                className={cn(
                  'rounded-lg border bg-background p-2.5',
                  highlightedPackageId === pkg.id ? 'border-violet-500/60' : 'border-border/70',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <MembershipCardHeader
                      title={pkg.title}
                      shortLabel={formatPatientPackageShortLabel(pkg.displayNumber)}
                      soldAt={pkg.soldAt ?? null}
                      packageMeta={formatPatientPackageLongLabel(pkg.displayNumber, pkg.soldAt)}
                      totalSessions={totalSessions}
                      remainingSessions={remainingSessions}
                      items={balanceItems.map((it) => ({
                        serviceTitle: it.serviceTitle,
                        quantityInitial: it.quantityInitial,
                        remaining: it.displayRemaining ?? it.remaining,
                      }))}
                      consumeDates={consumeDates ? consumeDates.map((s) => s.startsAt) : null}
                      consumeLoading={sessionState?.loading ?? false}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Подсветить записи абонемента ${formatPatientPackageShortLabel(pkg.displayNumber)} ${pkg.title}`}
                    aria-pressed={highlightedPackageId === pkg.id}
                    onClick={() => onToggleHighlight(pkg.id)}
                    className={cn(
                      'size-8 flex-none text-muted-foreground hover:text-violet-700',
                      highlightedPackageId === pkg.id ? 'bg-violet-500/10 text-violet-700' : '',
                    )}
                  >
                    <Eye className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                {pkg.validUntil ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    действует до: {fmtDate(pkg.validUntil.slice(0, 10))}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mutationsAllowed ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void recalculate(pkg.id)}
                    >
                      Пересчитать
                    </Button>
                  ) : null}
                  <Button type="button" size="xs" onClick={onOpenConfiguration}>
                    Списать
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={cn(doctorSectionSubtitleClass, 'text-xs')}>Активного абонемента нет.</p>
      )}

      {classifiedPackages.history.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 px-0.5 text-xs text-muted-foreground">
            <span className="flex-1">История закрытых абонементов</span>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {classifiedPackages.history.length}
            </span>
          </div>
          {classifiedPackages.history.map((pkg) => {
            const items = pkg.balance?.items ?? [];
            const total = items.reduce((s, it) => s + (it.quantityInitial ?? 0), 0);
            const remaining = items.reduce(
              (s, it) => s + (it.displayRemaining ?? it.remaining ?? 0),
              0,
            );
            const isOpen = openHistoryPackageIds.has(pkg.id);
            const sessionState = packageSessions[pkg.id];
            const consumeDates = sessionState?.sessions
              ? sessionState.sessions.filter((s) => s.linkage === 'consumed').map((s) => s.startsAt)
              : null;
            return (
              <div
                key={pkg.id}
                className={cn(
                  'rounded-lg border bg-muted/10',
                  highlightedPackageId === pkg.id ? 'border-violet-500/60' : 'border-border/60',
                )}
              >
                <div className="flex items-center gap-1 px-1 py-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => toggleHistoryPackage(pkg.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-xs text-muted-foreground hover:bg-muted/40"
                  >
                    {isOpen ? (
                      <ChevronDown
                        className="size-3.5 flex-none text-muted-foreground/70"
                        aria-hidden="true"
                      />
                    ) : (
                      <ChevronRight
                        className="size-3.5 flex-none text-muted-foreground/70"
                        aria-hidden="true"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
                      {formatPatientPackageShortLabel(pkg.displayNumber)} · {pkg.title}
                    </span>
                    <span className="flex-none text-muted-foreground/80">
                      использовано {total - remaining}/{total}
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Подсветить записи абонемента ${formatPatientPackageShortLabel(pkg.displayNumber)} ${pkg.title}`}
                    aria-pressed={highlightedPackageId === pkg.id}
                    onClick={() => onToggleHighlight(pkg.id)}
                    className={cn(
                      'size-7 flex-none text-muted-foreground hover:text-violet-700',
                      highlightedPackageId === pkg.id ? 'bg-violet-500/10 text-violet-700' : '',
                    )}
                  >
                    <Eye className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
                {isOpen ? (
                  <div className="border-t border-border/60 px-2.5 py-2 text-muted-foreground">
                    <MembershipCardHeader
                      title={pkg.title}
                      shortLabel={formatPatientPackageShortLabel(pkg.displayNumber)}
                      soldAt={pkg.soldAt ?? null}
                      packageMeta={formatPatientPackageLongLabel(pkg.displayNumber, pkg.soldAt)}
                      totalSessions={total}
                      remainingSessions={remaining}
                      items={items.map((it) => ({
                        serviceTitle: it.serviceTitle,
                        quantityInitial: it.quantityInitial,
                        remaining: it.displayRemaining ?? it.remaining,
                      }))}
                      consumeDates={consumeDates}
                      consumeLoading={sessionState?.loading ?? false}
                    />
                    <p className="mt-1 text-xs text-muted-foreground/80">
                      {pkg.soldAt
                        ? `куплен ${fmtDate(pkg.soldAt.slice(0, 10))}`
                        : 'дата покупки не указана'}
                      {pkg.validUntil ? ` · до ${fmtDate(pkg.validUntil.slice(0, 10))}` : ''}
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments panel — moved from PatientTabAccount (S2.5)
// Real data from GET /api/doctor/patients/{userId}/payments
// ---------------------------------------------------------------------------

export type PaymentItem = {
  id: string;
  amountMinor: number;
  currency?: string;
  kind: 'cash' | 'acquiring';
  status: string;
  comment?: string | null;
  service?: string | null;
  visitId?: string | null;
  createdAt: string;
};

type PaymentsResponse = {
  ok: true;
  payments: PaymentItem[];
  totalPaidMinor: number;
};

function fmtRub(minorAmount: number): string {
  return (minorAmount / 100).toLocaleString('ru-RU') + ' ₽';
}

function fmtPaymentDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function PaymentsPanel({
  userId,
  initialPaymentsSummary,
}: {
  userId: string;
  /** SSR-provided payments + total. When present, skips the initial client fetch. */
  initialPaymentsSummary?: { payments: PaymentItem[]; totalPaidMinor: number } | null;
}) {
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentItem[] | null>(
    () => initialPaymentsSummary?.payments ?? null,
  );
  const [totalPaidMinor, setTotalPaidMinor] = useState(
    () => initialPaymentsSummary?.totalPaidMinor ?? 0,
  );
  const [fetched, setFetched] = useState(() => initialPaymentsSummary != null);

  // Cash form state
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashAmountRub, setCashAmountRub] = useState('');
  const [cashComment, setCashComment] = useState('');
  const [cashService, setCashService] = useState('');
  const [cashPending, setCashPending] = useState(false);
  const [cashError, setCashError] = useState<string | null>(null);

  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const res = await fetch(`/api/doctor/patients/${encodeURIComponent(userId)}/payments`, {
        credentials: 'include',
      });
      if (res.status === 404 || res.status === 501) {
        setUnavailable(true);
        return;
      }
      const data = (await res.json().catch(() => null)) as PaymentsResponse | null;
      if (!res.ok || !data?.ok) {
        setUnavailable(true);
        return;
      }
      setPayments(data.payments);
      setTotalPaidMinor(data.totalPaidMinor);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCash = async () => {
    const rubles = parseFloat(cashAmountRub.replace(',', '.'));
    if (!rubles || rubles <= 0) {
      setCashError('Введите сумму > 0');
      return;
    }
    const amountMinor = Math.round(rubles * 100);
    setCashPending(true);
    setCashError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${encodeURIComponent(userId)}/payments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountMinor,
          comment: cashComment.trim() || undefined,
          service: cashService.trim() || undefined,
        }),
      });
      if (res.status === 404 || res.status === 501) {
        setCashError('Эндпоинт платежей ещё не готов — попробуйте позже.');
        return;
      }
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setCashError(data?.error ?? `Ошибка ${res.status}`);
        return;
      }
      setCashAmountRub('');
      setCashComment('');
      setCashService('');
      setShowCashForm(false);
      setFetched(false);
    } catch {
      setCashError('network');
    } finally {
      setCashPending(false);
    }
  };

  // Reload when fetched flag resets
  useEffect(() => {
    if (!fetched) {
      setFetched(true);
      void loadPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetched, userId]);

  return (
    <div className={doctorSectionCardClass}>
      <div className="flex items-center gap-2 flex-wrap">
        <p className={doctorSectionTitleClass}>Финансы · Платежи</p>
        {!unavailable && payments !== null && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setFetched(false)}
            className="ml-auto text-xs text-muted-foreground hover:text-primary"
          >
            обновить
          </Button>
        )}
      </div>

      {loading && (
        <p className={cn(doctorSectionSubtitleClass, 'text-[11px]')}>Загрузка платежей…</p>
      )}

      {unavailable && !loading && (
        <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
          Платежи недоступны — эндпоинт строится параллельным агентом. Данные появятся после деплоя
          миграции.
        </div>
      )}

      {error && !unavailable && !loading && <p className="text-[11px] text-destructive">{error}</p>}

      {!unavailable && !loading && payments !== null && (
        <>
          {/* Total */}
          <DoctorStatCard
            id="patient-records-payments-total"
            title="Итого оплачено"
            value={fmtRub(totalPaidMinor)}
          />

          {/* Payment list */}
          {payments.length === 0 ? (
            <p className={cn(doctorSectionSubtitleClass, 'text-[11px]')}>Нет записей об оплате.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className={cn(doctorSectionItemClass, 'flex items-center gap-2 text-xs')}
                >
                  <span className="flex-none text-muted-foreground text-[11px] font-medium">
                    {p.kind === 'cash' ? 'нал' : 'экв'}
                  </span>
                  <span className="flex-1 truncate">
                    {p.service ?? p.comment ?? (p.kind === 'cash' ? 'Наличные' : 'Эквайринг')}
                    {p.comment && p.service && (
                      <span className="text-muted-foreground ml-1">· {p.comment}</span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums whitespace-nowrap">
                    {fmtRub(p.amountMinor)}
                  </span>
                  <span className={cn(doctorSectionSubtitleClass, 'whitespace-nowrap pl-2')}>
                    {fmtPaymentDate(p.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Manual cash form */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCashForm((v) => !v);
                setCashError(null);
              }}
            >
              Внести наличные
            </Button>
            <span className="text-[11px] text-muted-foreground">Эквайринг — скоро</span>
          </div>

          {showCashForm && (
            <div className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2 shadow-sm">
              <p className={cn(doctorSectionTitleClass, 'text-xs')}>Внести наличные</p>
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
                  <label className="text-[11px] text-muted-foreground">Сумма, ₽</label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="4000"
                    value={cashAmountRub}
                    onChange={(e) => setCashAmountRub(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <label className="text-[11px] text-muted-foreground">Услуга</label>
                  <Input
                    type="text"
                    placeholder="Приём · 60 мин"
                    value={cashService}
                    onChange={(e) => setCashService(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                  <label className="text-[11px] text-muted-foreground">Комментарий</label>
                  <Input
                    type="text"
                    placeholder="доп. инфо…"
                    value={cashComment}
                    onChange={(e) => setCashComment(e.target.value)}
                  />
                </div>
              </div>
              {cashError && <p className="text-[11px] text-destructive">{cashError}</p>}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cashPending}
                  onClick={() => {
                    setShowCashForm(false);
                    setCashError(null);
                  }}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={cashPending}
                  onClick={() => void handleSubmitCash()}
                >
                  {cashPending ? '…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <p className={cn(doctorSectionSubtitleClass, 'text-[11px]')}>
        Учёт наличных платежей. Эквайринг (провайдер не выбран) — следующий этап.
      </p>
    </div>
  );
}
