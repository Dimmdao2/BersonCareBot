'use client';

/**
 * PatientTabOverview — Wave 4: «Обзор» tab wired to real backend.
 * Two columns 50/50 from `md:` up, single column below (mobile-width fix 2026-08-20):
 *   LEFT  — KPIs · Сигналы · Актуальные симптомы · Динамика симптомов
 *   RIGHT — Заметки · Задачи · Программа ЛФК · Сообщения
 *
 * All widgets fetch independently; each degrades gracefully on error/empty.
 * Parallel fetches via Promise.all — no waterfall.
 * Pattern mirrors PatientTabRecords.tsx / PatientTabKarta.tsx.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FilePlus2, ListPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PatientCardHeader, PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import { DoctorClientSupportPanel } from '@/app/app/doctor/clients/DoctorClientSupportPanel';
import type { ActiveComplaint, ClinicalState, Visit } from '@/modules/patient-clinical/ports';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import type { DoctorNoteRow } from '@/modules/doctor-notes/ports';
import {
  serializeSupportMessage,
  type SerializedSupportMessage,
} from '@/modules/messaging/serializeSupportMessage';
import type { DoctorPatientProgramActivity } from '@/app/app/doctor/patients/loadDoctorPatientProgramActivity';
import type { DoctorPatientExerciseCalendarSnapshot } from '@/app/app/doctor/patients/loadDoctorPatientExerciseCalendar';
import type { DoctorPatientMessagesSnapshot } from '@/app/app/doctor/patients/loadDoctorPatientMessagesSnapshot';
import type { BootstrapEnvelope } from '@/app/app/doctor/patients/doctorPatientCardBootstrapShared';
import {
  isBootstrapEnvelopeFailed,
  unwrapBootstrapEnvelope,
} from '@/app/app/doctor/patients/doctorPatientCardBootstrapShared';
import { useMessagePolling } from '@/modules/messaging/hooks/useMessagePolling';
import type {
  TreatmentProgramInstanceSummary,
  TreatmentProgramInstanceDetail,
} from '@/modules/treatment-program/types';
import {
  deriveOverviewProgramWidgetFromDetail,
  pickOpenTreatmentProgramInstance,
} from '../../treatmentProgramInstanceOpen';
import { expectedStageControlDateIso } from '@/modules/treatment-program/stage-semantics';
import {
  doctorBodyTextClass,
  doctorMetaTextClass,
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorStatCard } from '@/app/app/doctor/analytics/clients/DoctorStatCard';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { formatPatientPackageLongLabel } from '@/modules/memberships/display';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { SpecialistTaskFormDialog } from '@/app/app/doctor/clients/SpecialistTaskFormDialog';
import { isSpecialistTaskOverdue } from '@/modules/specialist-tasks/taskPriority';

// ---------------------------------------------------------------------------
// Backend response types
// ---------------------------------------------------------------------------

interface ClinicalApiResponse {
  ok: boolean;
  state: {
    complaints: ActiveComplaint[];
  };
  visits: Array<{
    id: string;
    date: string;
    type: 'first' | 'repeat';
    dynamics?: Array<{
      id: string;
      label: string;
      from: number;
      to: number;
      note: string;
      priority: boolean;
    }>;
  }>;
}

interface AppointmentItem {
  id: string;
  dateTime: string;
  status: 'upcoming' | 'completed' | 'rescheduled' | 'canceled';
  serviceName?: string | null;
  location?: string | null;
  durationMin?: number | null;
}

interface AppointmentsApiResponse {
  appointments: AppointmentItem[];
}

interface PackageItem {
  id: string;
  displayNumber?: number | null;
  title?: string | null;
  quantityInitial?: number | null;
  remaining?: number | null;
  /** Display remaining: reserved sessions count as still-owned (better for patient-facing copy). */
  displayRemaining?: number | null;
  soldAt?: string | null;
  validUntil?: string | null;
  status?: string | null;
  balance?: {
    items: Array<{
      quantityInitial?: number | null;
      remaining?: number | null;
      /** Display remaining: reserved sessions count as still-owned. */
      displayRemaining?: number | null;
      serviceTitle?: string | null;
      serviceId?: string | null;
    }>;
  } | null;
}

interface PackagesApiResponse {
  ok: boolean;
  packages: PackageItem[];
}

interface NotesApiResponse {
  ok: boolean;
  notes: DoctorNoteRow[];
}

interface TasksApiResponse {
  ok: boolean;
  tasks: SpecialistTaskRow[];
}

interface TreatmentInstanceItem {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'archived' | string;
  createdAt: string;
  updatedAt: string;
}

interface TreatmentInstanceStage {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
  startedAt?: string | null;
  expectedDurationDays?: number | null;
  groups: Array<{ id: string; title: string; systemKind?: string | null }>;
  items: Array<{
    id: string;
    itemType: string;
    sortOrder: number;
    groupId?: string | null;
    snapshot?: {
      title?: string | null;
      loadType?: string | null;
      difficulty?: number | null;
      /** Raw media rows as stored in the snapshot JSON; may include previewSmUrl/previewMdUrl from the media worker. */
      media?: Array<{
        mediaUrl: string;
        mediaType: string;
        sortOrder: number;
        previewSmUrl?: string | null;
        previewMdUrl?: string | null;
        previewStatus?: string | null;
      }> | null;
    } | null;
    effectiveComment?: string | null;
    settings?: Record<string, unknown> | null;
  }>;
}

interface TreatmentInstanceDetailResponse {
  ok: boolean;
  item: TreatmentInstanceItem & { stages: TreatmentInstanceStage[] };
}

interface ProgramInstancesApiResponse {
  ok: boolean;
  items: TreatmentInstanceItem[];
}

interface ProgramActivityApiResponse {
  ok: boolean;
  activity: DoctorPatientProgramActivity;
}

interface CalendarDay {
  date: string; // YYYY-MM-DD
  completedCount: number;
}

interface ExerciseCalendarApiResponse {
  ok: boolean;
  iana?: string;
  from?: string;
  to?: string;
  days: CalendarDay[];
}

interface MessagesApiResponse {
  ok: boolean;
  conversationId?: string;
  messages: SerializedSupportMessage[];
  unreadFromUserCount: number;
}

// ---------------------------------------------------------------------------
// Aggregated fetch state
// ---------------------------------------------------------------------------

type WidgetStatus = 'loading' | 'ok' | 'error' | 'empty';

interface OverviewData {
  // Clinical
  clinicalStatus: WidgetStatus;
  complaints: ActiveComplaint[];
  symptomSeries: SymptomSeries[];

  // KPI — Control (appointments)
  appointmentsStatus: WidgetStatus;
  controlDays: number | null;
  controlDate: string | null;

  // KPI — Package
  packageStatus: WidgetStatus;
  activePackage: PackageItem | null;
  activePackages: PackageItem[];

  // Treatment program
  programStatus: WidgetStatus;
  programTitle: string | null;
  programStages: TreatmentInstanceStage[];
  programCurrentStage: TreatmentInstanceStage | null;
  programCurrentStageIndex: number; // 0-based index into programStages
  /** Активность по программе: последняя отметка пациента + число непрочитанных. */
  programActivity: DoctorPatientProgramActivity | null;

  // Notes
  notesStatus: WidgetStatus;
  notes: DoctorNoteRow[];

  // Tasks
  tasksStatus: WidgetStatus;
  tasks: SpecialistTaskRow[];

  // Exercise calendar
  calendarStatus: WidgetStatus;
  calendarDays: CalendarDay[];

  // Messages
  messagesStatus: WidgetStatus;
  messages: SerializedSupportMessage[];
  unreadFromUserCount: number;
}

type SymptomSeries = {
  name: string;
  color: string;
  points: Array<{ visit: string; score: number }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysFromNow(isoDate: string): number {
  const now = new Date();
  const target = new Date(isoDate);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function fmtDateShort(iso: string): string {
  // ISO → "DD.MM"
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDateMsgShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function summarizePackageBalance(pkg: PackageItem): { remaining: number | null; services: string } {
  const items = pkg.balance?.items ?? [];
  if (items.length === 0) {
    return {
      remaining: pkg.displayRemaining ?? pkg.remaining ?? null,
      services: '',
    };
  }
  let totalRemaining = 0;
  let hasRemaining = false;
  const services = items
    .map((item) => {
      const remaining = item.displayRemaining ?? item.remaining ?? 0;
      if (item.displayRemaining != null || item.remaining != null) {
        hasRemaining = true;
      }
      totalRemaining += remaining;
      return `${remaining} x ${item.serviceTitle ?? item.serviceId ?? 'Услуга'}`;
    })
    .join(', ');
  return { remaining: hasRemaining ? totalRemaining : null, services };
}

function formatOverviewPackageSummary(pkg: PackageItem): string {
  const { services } = summarizePackageBalance(pkg);
  return [services, formatPatientPackageLongLabel(pkg.displayNumber, pkg.soldAt)]
    .filter(Boolean)
    .join(' ');
}

function sumPackageBalance(
  key: 'quantityInitial' | 'remaining' | 'displayRemaining',
  pkg: PackageItem,
): number | null {
  const items = pkg.balance?.items;
  if (items && items.length > 0) {
    const hasField = items.some((it) => it[key] != null);
    if (!hasField) return null;
    return items.reduce((acc, it) => acc + (it[key] ?? 0), 0);
  }
  return pkg[key] ?? null;
}

function normalizeActivePackages(packages: PackageItem[] | null | undefined): PackageItem[] {
  return (packages ?? [])
    .filter((p) => p.status === 'active' || p.status === 'activated')
    .map((pkg) => ({
      ...pkg,
      quantityInitial: sumPackageBalance('quantityInitial', pkg),
      remaining: sumPackageBalance('remaining', pkg),
      displayRemaining: sumPackageBalance('displayRemaining', pkg),
    }));
}

/** Build per-complaint dynamics series from clinical visits. */
function buildSymptomSeries(
  complaints: ActiveComplaint[],
  visits: ClinicalApiResponse['visits'],
): SymptomSeries[] {
  if (complaints.length === 0 || visits.length === 0) return [];

  // Colors: priority complaint → primary; others → secondary
  const COLORS = ['var(--primary, #3b82f6)', '#c2812e', '#9b59b6', '#2ecc71', '#e74c3c'];

  // Sort visits oldest→newest (visits come newest→oldest from API)
  const sorted = [...visits].reverse();

  return complaints.map((c, idx) => {
    const points: Array<{ visit: string; score: number }> = [];

    for (const v of sorted) {
      if (!v.dynamics) continue;
      const match = v.dynamics.find((d) => d.label === c.text);
      if (match) {
        points.push({ visit: v.date, score: match.to });
      }
    }

    // If we got no dynamics points but have trend data from state — use trend
    if (points.length === 0 && c.trend.length > 0) {
      c.trend.forEach((score, i) => {
        points.push({ visit: `Визит ${i + 1}`, score });
      });
    }

    const color = c.priority ? COLORS[0] : (COLORS[idx + 1] ?? COLORS[1]);
    const label = `${c.priority ? '⚑ ' : ''}${c.text.length > 20 ? c.text.slice(0, 20) + '…' : c.text} · ${c.currentSeverity}/10`;
    return { name: label, color, points };
  });
}

/** Get ISO range for any calendar month (1-based month). */
function monthRangeFor(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month, 0); // day 0 of next month = last day of this month
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last.getDate())}`,
  };
}

/** Russian month+year label for the given 1-based month. */
function monthLabelFor(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  id,
  label,
  value,
  hint,
  loading,
}: {
  id: string;
  label: string;
  value: string;
  hint: string;
  loading?: boolean;
}) {
  return (
    <DoctorStatCard
      id={id}
      title={label}
      value={loading ? '…' : value}
      hint={loading ? undefined : hint}
      valueClassName={loading ? 'animate-pulse text-muted-foreground' : undefined}
    />
  );
}

export const overviewSymptomSeverityBadgeClass =
  'font-bold text-primary bg-primary/10 tabular-nums';

function ScoreBadge({ score, size = 'base' }: { score: number; size?: 'base' | 'sm' }) {
  const cls =
    size === 'base'
      ? cn(overviewSymptomSeverityBadgeClass, 'text-xs rounded-[9px] px-2 py-0.5')
      : cn(overviewSymptomSeverityBadgeClass, 'text-[11px] rounded-lg px-1.5 py-0');
  return <span className={cls}>{score}/10</span>;
}

function SymptomChart({ series }: { series: SymptomSeries[] }) {
  const validSeries = series.filter((s) => s.points.length >= 2);
  if (validSeries.length === 0) return null;

  const W = 480;
  const H = 168;
  const padLeft = 34;
  const padRight = 14;
  const padTop = 10;
  const chartH = 130;
  const chartW = W - padLeft - padRight;

  const yLabels = [10, 8, 6, 4, 2, 0];
  const yOf = (score: number) => padTop + ((10 - score) / 10) * chartH;
  const xLabels = validSeries[0].points.map((p) => p.visit);
  const nPoints = validSeries[0].points.length;
  const xOf = (i: number) => padLeft + (i / Math.max(nPoints - 1, 1)) * chartW;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <g stroke="#edf0f5" strokeWidth="1">
        {yLabels.map((v) => (
          <line key={v} x1={padLeft} y1={yOf(v)} x2={W - padRight} y2={yOf(v)} />
        ))}
      </g>
      <g fontSize="9" fill="#8b95a3">
        {yLabels.map((v) => (
          <text key={v} x={padLeft - 6} y={yOf(v) + 3} textAnchor="end">
            {v}
          </text>
        ))}
      </g>
      {validSeries.map((s) => {
        const pts = s.points.map((p, i) => `${xOf(i)},${yOf(p.score)}`).join(' ');
        return (
          <g key={s.name}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth="2" />
            {s.points.map((p, i) => (
              <circle
                key={i}
                cx={xOf(i)}
                cy={yOf(p.score)}
                r={i === s.points.length - 1 ? 3.5 : 3}
                fill={s.color}
              />
            ))}
          </g>
        );
      })}
      <g fontSize="9.5" fill="#5a6675">
        {xLabels.map((label, i) => (
          <text key={i} x={xOf(i)} y={H - 12} textAnchor="middle">
            {label.length > 12 ? label.slice(0, 12) : label}
          </text>
        ))}
      </g>
    </svg>
  );
}

type CalendarDayStatus = 'full' | 'partial' | 'missed' | 'no-assign' | 'future' | 'today';

interface CalendarCellData {
  day: number;
  status: CalendarDayStatus;
  ratio?: number;
}

function CalendarCell({ day }: { day: CalendarCellData }) {
  let bg = '';
  let textColor = '';
  let ring = '';

  switch (day.status) {
    case 'full':
      bg = 'bg-primary';
      textColor = 'text-white font-semibold';
      break;
    case 'partial':
      bg = day.ratio && day.ratio > 0.4 ? 'bg-[hsl(215_45%_76%)]' : 'bg-[hsl(215_45%_89%)]';
      textColor =
        day.ratio && day.ratio > 0.4 ? 'text-white font-semibold' : 'text-muted-foreground';
      break;
    case 'missed':
      bg = 'bg-background border border-border';
      textColor = 'text-muted-foreground';
      break;
    case 'no-assign':
      bg = 'bg-muted/40';
      textColor = 'text-muted-foreground/50';
      break;
    case 'today':
      bg = 'bg-background border border-border';
      textColor = 'text-muted-foreground';
      ring = 'ring-2 ring-[#e8c84a] ring-inset';
      break;
    case 'future':
      bg = 'bg-muted/20';
      textColor = 'text-muted-foreground/40';
      break;
  }

  return (
    <div
      className={cn(
        'h-[26px] rounded-md flex items-center justify-center text-[10px]',
        bg,
        textColor,
        ring,
      )}
    >
      {day.day}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  active?: boolean;
  userId: string;
  header?: PatientCardHeader;
  onTabSwitch?: (tab: string) => void;
  initialClinicalState?: BootstrapEnvelope<ClinicalState> | null;
  initialVisits?: BootstrapEnvelope<Visit[]> | null;
  initialNotes?: BootstrapEnvelope<DoctorNoteRow[]> | null;
  initialTasks?: BootstrapEnvelope<SpecialistTaskRow[]> | null;
  initialProgramActivity?: BootstrapEnvelope<DoctorPatientProgramActivity> | null;
  initialAppointments?: BootstrapEnvelope<PatientAppointmentItem[]> | null;
  /** SSR-provided patient packages. When present, skips the client-side fetch. */
  initialPackages?: BootstrapEnvelope<PackageItem[]> | null;
  /** SSR program instances list — skips client list fetch on overview. */
  initialProgramInstances?: BootstrapEnvelope<TreatmentProgramInstanceSummary[]> | null;
  /** SSR open program detail — skips client detail fetch on overview. */
  initialProgramInstanceDetail?: BootstrapEnvelope<TreatmentProgramInstanceDetail | null> | null;
  /** SSR exercise calendar snapshot for the visible month on first paint. */
  initialExerciseCalendarSnapshot?: BootstrapEnvelope<DoctorPatientExerciseCalendarSnapshot> | null;
  /** Read-only chat snapshot — no conversations/ensure on mount. */
  initialMessagesSnapshot?: BootstrapEnvelope<DoctorPatientMessagesSnapshot> | null;
  membershipsVisible?: boolean;
  /** SSR-provided effective support policy. Passed to DoctorClientSupportPanel to skip its fetch. */
  initialSupportEffectivePolicy?: BootstrapEnvelope<
    import('@/modules/doctor-clients/supportPolicy').PatientProgramInteractionPolicy | null
  > | null;
  specialistTasksAvailable: boolean;
  specialistTasksReadable: boolean;
  /** Places the reusable widgets in a composed patient-card surface. */
  compositionMode?: 'right-pane' | 'overview';
};

function monthPartsFromIsoDate(isoDate: string): { year: number; month: number } {
  const [year, month] = isoDate.split('-').map((part) => Number(part));
  return { year, month };
}

function resolveProgramSeedFields(
  initialProgramInstances?: BootstrapEnvelope<TreatmentProgramInstanceSummary[]> | null,
  initialProgramInstanceDetail?: BootstrapEnvelope<TreatmentProgramInstanceDetail | null> | null,
): Pick<
  OverviewData,
  | 'programStatus'
  | 'programTitle'
  | 'programStages'
  | 'programCurrentStage'
  | 'programCurrentStageIndex'
> {
  if (initialProgramInstances != null && isBootstrapEnvelopeFailed(initialProgramInstances)) {
    return {
      programStatus: 'error',
      programTitle: null,
      programStages: [],
      programCurrentStage: null,
      programCurrentStageIndex: 0,
    };
  }
  const programInstanceDetail = unwrapBootstrapEnvelope(initialProgramInstanceDetail);
  if (programInstanceDetail) {
    return deriveOverviewProgramWidgetFromDetail(programInstanceDetail);
  }
  const programInstances = unwrapBootstrapEnvelope(initialProgramInstances);
  if (initialProgramInstances != null) {
    const open = pickOpenTreatmentProgramInstance(programInstances ?? []);
    if (!open) {
      return {
        programStatus: 'empty',
        programTitle: null,
        programStages: [],
        programCurrentStage: null,
        programCurrentStageIndex: 0,
      };
    }
    if (
      initialProgramInstanceDetail != null &&
      isBootstrapEnvelopeFailed(initialProgramInstanceDetail)
    ) {
      return {
        programStatus: 'error',
        programTitle: open.title,
        programStages: [],
        programCurrentStage: null,
        programCurrentStageIndex: 0,
      };
    }
    if (initialProgramInstanceDetail != null) {
      return {
        programStatus: 'error',
        programTitle: open.title,
        programStages: [],
        programCurrentStage: null,
        programCurrentStageIndex: 0,
      };
    }
    return {
      programStatus: 'loading',
      programTitle: open.title,
      programStages: [],
      programCurrentStage: null,
      programCurrentStageIndex: 0,
    };
  }
  return {
    programStatus: 'loading',
    programTitle: null,
    programStages: [],
    programCurrentStage: null,
    programCurrentStageIndex: 0,
  };
}

function isOverviewBootstrapComplete(
  membershipsVisible: boolean,
  initialPackages: BootstrapEnvelope<PackageItem[]> | null | undefined,
  initialProgramInstances: BootstrapEnvelope<TreatmentProgramInstanceSummary[]> | null | undefined,
  initialProgramInstanceDetail:
    BootstrapEnvelope<TreatmentProgramInstanceDetail | null> | null | undefined,
): boolean {
  if (membershipsVisible && initialPackages == null) {
    return false;
  }
  if (initialProgramInstances == null) {
    return false;
  }
  if (isBootstrapEnvelopeFailed(initialProgramInstances)) return true;
  const open = pickOpenTreatmentProgramInstance(
    unwrapBootstrapEnvelope(initialProgramInstances) ?? [],
  );
  if (open != null && initialProgramInstanceDetail == null) {
    return false;
  }
  return true;
}

/** Derive the complete first-paint overview state from the server bootstrap envelopes. */
function buildSsrSeedData(
  initialClinicalState: BootstrapEnvelope<ClinicalState>,
  initialVisits: BootstrapEnvelope<Visit[]>,
  initialNotes: BootstrapEnvelope<DoctorNoteRow[]>,
  initialTasks: BootstrapEnvelope<SpecialistTaskRow[]>,
  initialProgramActivity: BootstrapEnvelope<DoctorPatientProgramActivity>,
  initialAppointments: BootstrapEnvelope<PatientAppointmentItem[]>,
  initialPackages?: BootstrapEnvelope<PackageItem[]> | null,
  initialExerciseCalendarSnapshot?: BootstrapEnvelope<DoctorPatientExerciseCalendarSnapshot> | null,
  initialMessagesSnapshot?: BootstrapEnvelope<DoctorPatientMessagesSnapshot> | null,
  initialProgramInstances?: BootstrapEnvelope<TreatmentProgramInstanceSummary[]> | null,
  initialProgramInstanceDetail?: BootstrapEnvelope<TreatmentProgramInstanceDetail | null> | null,
): OverviewData {
  const clinicalState = unwrapBootstrapEnvelope(initialClinicalState);
  const visits = unwrapBootstrapEnvelope(initialVisits) ?? [];
  const notes = unwrapBootstrapEnvelope(initialNotes) ?? [];
  const tasks = unwrapBootstrapEnvelope(initialTasks) ?? [];
  const programActivity = unwrapBootstrapEnvelope(initialProgramActivity);
  const appointments = unwrapBootstrapEnvelope(initialAppointments) ?? [];
  const complaints = clinicalState?.complaints ?? [];
  const clinicalFailed =
    isBootstrapEnvelopeFailed(initialClinicalState) || isBootstrapEnvelopeFailed(initialVisits);
  const clinicalStatus: WidgetStatus = clinicalFailed
    ? 'error'
    : complaints.length === 0
      ? 'empty'
      : 'ok';
  const symptomSeries = clinicalFailed
    ? []
    : buildSymptomSeries(
        complaints,
        visits.map((v) => ({
          id: v.id,
          date: v.date,
          type: v.type,
          dynamics: v.dynamics?.map((d) => ({
            id: d.id,
            label: d.label,
            from: d.from,
            to: d.to,
            note: d.note,
            priority: d.priority,
          })),
        })),
      );

  const upcomingAppts = appointments.filter((a) => a.status === 'upcoming');
  upcomingAppts.sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  const nearestUpcoming = upcomingAppts[0] ?? null;
  const controlDays = nearestUpcoming ? daysFromNow(nearestUpcoming.dateTime) : null;
  const controlDate = nearestUpcoming ? fmtDateShort(nearestUpcoming.dateTime) : null;
  const appointmentsStatus: WidgetStatus = isBootstrapEnvelopeFailed(initialAppointments)
    ? 'error'
    : nearestUpcoming === null
      ? 'empty'
      : 'ok';

  const notesList = notes;
  const notesStatus: WidgetStatus = isBootstrapEnvelopeFailed(initialNotes) ? 'error' : 'ok';

  const tasksList = tasks.filter((t) => !t.completedAt);
  tasksList.sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });
  const tasksStatus: WidgetStatus = isBootstrapEnvelopeFailed(initialTasks) ? 'error' : 'ok';

  const activePackages = normalizeActivePackages(unwrapBootstrapEnvelope(initialPackages));
  const activePackage: PackageItem | null = activePackages[0] ?? null;
  const packageStatus: WidgetStatus =
    initialPackages == null
      ? 'loading'
      : isBootstrapEnvelopeFailed(initialPackages)
        ? 'error'
        : activePackage === null
          ? 'empty'
          : 'ok';

  const programSeed = resolveProgramSeedFields(
    initialProgramInstances,
    initialProgramInstanceDetail,
  );

  const exerciseCalendarSnapshot = unwrapBootstrapEnvelope(initialExerciseCalendarSnapshot);
  const messagesSnapshot = unwrapBootstrapEnvelope(initialMessagesSnapshot);

  return {
    clinicalStatus,
    complaints,
    symptomSeries,
    appointmentsStatus,
    controlDays,
    controlDate,
    packageStatus,
    activePackage,
    activePackages,
    programStatus: programSeed.programStatus,
    programTitle: programSeed.programTitle,
    programStages: programSeed.programStages,
    programCurrentStage: programSeed.programCurrentStage,
    programCurrentStageIndex: programSeed.programCurrentStageIndex,
    programActivity,
    notesStatus,
    notes: notesList,
    tasksStatus,
    tasks: tasksList,
    calendarStatus:
      initialExerciseCalendarSnapshot == null
        ? ('loading' as WidgetStatus)
        : isBootstrapEnvelopeFailed(initialExerciseCalendarSnapshot)
          ? 'error'
          : 'ok',
    calendarDays: exerciseCalendarSnapshot?.days ?? [],
    messagesStatus:
      initialMessagesSnapshot == null
        ? ('loading' as WidgetStatus)
        : isBootstrapEnvelopeFailed(initialMessagesSnapshot)
          ? 'error'
          : 'ok',
    messages: messagesSnapshot ? messagesSnapshot.messages.map(serializeSupportMessage) : [],
    unreadFromUserCount: messagesSnapshot?.unreadFromUserCount ?? 0,
  };
}

export function PatientTabOverview({
  active = true,
  userId,
  onTabSwitch,
  initialClinicalState,
  initialVisits,
  initialNotes,
  initialTasks,
  initialProgramActivity,
  initialAppointments,
  initialPackages,
  initialProgramInstances,
  initialProgramInstanceDetail,
  initialExerciseCalendarSnapshot,
  initialMessagesSnapshot,
  membershipsVisible = true,
  initialSupportEffectivePolicy,
  specialistTasksAvailable,
  specialistTasksReadable,
  compositionMode,
}: Props) {
  const isComposed = compositionMode != null;
  const isOverviewComposition = compositionMode === 'overview';
  const seededExerciseCalendar = unwrapBootstrapEnvelope(initialExerciseCalendarSnapshot);
  const initialCalParts = seededExerciseCalendar
    ? monthPartsFromIsoDate(seededExerciseCalendar.from)
    : monthPartsFromIsoDate(new Date().toISOString().slice(0, 10));
  const [calYear, setCalYear] = useState(initialCalParts.year);
  const [calMonth, setCalMonth] = useState(initialCalParts.month);
  const calendarSwipeStartXRef = useRef<number | null>(null);
  const [data, setData] = useState<OverviewData | null>(() => {
    if (
      initialClinicalState != null &&
      initialVisits != null &&
      initialNotes != null &&
      initialTasks != null &&
      initialProgramActivity != null &&
      initialAppointments != null
    ) {
      return buildSsrSeedData(
        initialClinicalState,
        initialVisits,
        initialNotes,
        initialTasks,
        initialProgramActivity,
        initialAppointments,
        initialPackages,
        initialExerciseCalendarSnapshot,
        initialMessagesSnapshot,
        initialProgramInstances,
        initialProgramInstanceDetail,
      );
    }
    return null;
  });
  const [loadedUserId, setLoadedUserId] = useState<string | null>(() => {
    if (
      initialClinicalState != null &&
      initialVisits != null &&
      initialNotes != null &&
      initialTasks != null &&
      initialProgramActivity != null &&
      initialAppointments != null
    ) {
      return userId;
    }
    return null;
  });

  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [tasksModalOpen, setTasksModalOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<SpecialistTaskRow | null>(null);

  const hasSsrData =
    initialClinicalState != null &&
    initialVisits != null &&
    initialNotes != null &&
    initialTasks != null &&
    initialProgramActivity != null &&
    initialAppointments != null;

  // Track whether we've seeded SSR data for the current userId to avoid
  // overwriting mutation-triggered setData calls on re-render.
  const ssrSeedRef = useRef<string | null>(hasSsrData ? userId : null);

  useEffect(() => {
    const seeded = unwrapBootstrapEnvelope(initialExerciseCalendarSnapshot);
    if (!seeded) return;
    const { year, month } = monthPartsFromIsoDate(seeded.from);
    if (calYear === year && calMonth === month) {
      setData((prev) =>
        prev
          ? {
              ...prev,
              calendarStatus: 'ok',
              calendarDays: seeded.days,
            }
          : prev,
      );
      return;
    }

    let cancelled = false;
    setData((prev) => (prev ? { ...prev, calendarStatus: 'loading', calendarDays: [] } : prev));
    const { from, to } = monthRangeFor(calYear, calMonth);
    fetch(`/api/doctor/patients/${userId}/exercise-calendar?from=${from}&to=${to}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? (r.json() as Promise<ExerciseCalendarApiResponse>) : null))
      .catch(() => null)
      .then((calendar) => {
        if (cancelled) return;
        const calendarDays = calendar?.days ?? [];
        const calendarStatus: WidgetStatus = !calendar ? 'error' : 'ok';
        setData((prev) => (prev ? { ...prev, calendarStatus, calendarDays } : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, calYear, calMonth, initialExerciseCalendarSnapshot]);

  useEffect(() => {
    if (!membershipsVisible) return;
    let active = true;
    const loadPackages = () => {
      fetch(`/api/doctor/booking-engine/patient-packages?platformUserId=${userId}`, {
        credentials: 'include',
      })
        .then((r) => (r.ok ? (r.json() as Promise<PackagesApiResponse>) : null))
        .catch(() => null)
        .then((packages) => {
          if (!active) return;
          const activePackages = normalizeActivePackages(packages?.packages);
          const activePackage = activePackages[0] ?? null;
          setData((prev) =>
            prev
              ? {
                  ...prev,
                  packageStatus: !packages ? 'error' : activePackage === null ? 'empty' : 'ok',
                  activePackage,
                  activePackages,
                }
              : prev,
          );
        });
    };
    window.addEventListener('patient:packages-changed', loadPackages);
    return () => {
      active = false;
      window.removeEventListener('patient:packages-changed', loadPackages);
    };
  }, [userId, membershipsVisible]);

  useEffect(() => {
    if (
      hasSsrData &&
      ssrSeedRef.current === userId &&
      isOverviewBootstrapComplete(
        membershipsVisible,
        initialPackages,
        initialProgramInstances,
        initialProgramInstanceDetail,
      )
    ) {
      return;
    }

    let active = true;

    // patient-packages: skip when SSR data provided
    const fetchPackages = !membershipsVisible
      ? Promise.resolve(null)
      : initialPackages?.ok
        ? Promise.resolve({
            ok: true,
            packages: initialPackages.value,
          } as PackagesApiResponse)
        : initialPackages != null && isBootstrapEnvelopeFailed(initialPackages)
          ? Promise.resolve(null)
          : fetch(`/api/doctor/booking-engine/patient-packages?platformUserId=${userId}`, {
              credentials: 'include',
            })
              .then((r) => (r.ok ? (r.json() as Promise<PackagesApiResponse>) : null))
              .catch(() => null);

    const fetchProgram = initialProgramInstances?.ok
      ? Promise.resolve({
          ok: true,
          items: initialProgramInstances.value,
        } as ProgramInstancesApiResponse)
      : initialProgramInstances != null && isBootstrapEnvelopeFailed(initialProgramInstances)
        ? Promise.resolve(null)
        : fetch(`/api/doctor/clients/${userId}/treatment-program-instances`, {
            credentials: 'include',
          })
            .then((r) => (r.ok ? (r.json() as Promise<ProgramInstancesApiResponse>) : null))
            .catch(() => null);

    const fetchMessages = initialMessagesSnapshot?.ok
      ? Promise.resolve({
          source: 'seed' as const,
          ok: true,
          conversationId: initialMessagesSnapshot.value.conversationId ?? undefined,
          messages: initialMessagesSnapshot.value.messages.map(serializeSupportMessage),
          unreadFromUserCount: initialMessagesSnapshot.value.unreadFromUserCount,
        })
      : initialMessagesSnapshot != null && isBootstrapEnvelopeFailed(initialMessagesSnapshot)
        ? Promise.resolve({ source: 'failed' as const })
        : // Null seed: one initial read comes from useMessagePolling(immediate=true).
          Promise.resolve({ source: 'deferred' as const });

    // Conditionally fetch SSR-covered data only when SSR props were not provided
    const fetchClinical =
      hasSsrData && ssrSeedRef.current === userId
        ? Promise.resolve(null as ClinicalApiResponse | null)
        : fetch(`/api/doctor/patients/${userId}/clinical`, { credentials: 'include' })
            .then((r) => (r.ok ? (r.json() as Promise<ClinicalApiResponse>) : null))
            .catch(() => null);

    const fetchAppointments =
      hasSsrData && ssrSeedRef.current === userId
        ? Promise.resolve(null as AppointmentsApiResponse | null)
        : fetch(`/api/doctor/patients/${userId}/appointments`, { credentials: 'include' })
            .then((r) => (r.ok ? (r.json() as Promise<AppointmentsApiResponse>) : null))
            .catch(() => null);

    const fetchNotes =
      hasSsrData && ssrSeedRef.current === userId
        ? Promise.resolve(null as NotesApiResponse | null)
        : fetch(`/api/doctor/clients/${userId}/notes`, { credentials: 'include' })
            .then((r) => (r.ok ? (r.json() as Promise<NotesApiResponse>) : null))
            .catch(() => null);

    const fetchTasks =
      !specialistTasksReadable || (hasSsrData && ssrSeedRef.current === userId)
        ? Promise.resolve(null as TasksApiResponse | null)
        : fetch(`/api/doctor/clients/${userId}/tasks`, { credentials: 'include' })
            .then((r) => (r.ok ? (r.json() as Promise<TasksApiResponse>) : null))
            .catch(() => null);

    const fetchProgramActivity =
      hasSsrData && ssrSeedRef.current === userId
        ? Promise.resolve(null as ProgramActivityApiResponse | null)
        : fetch(`/api/doctor/patients/${userId}/program-activity`, { credentials: 'include' })
            .then((r) => (r.ok ? (r.json() as Promise<ProgramActivityApiResponse>) : null))
            .catch(() => null);

    Promise.all([
      fetchClinical,
      fetchAppointments,
      fetchPackages,
      fetchNotes,
      fetchTasks,
      fetchProgram,
      fetchProgramActivity,
      fetchMessages,
    ]).then(
      async ([
        clinical,
        appointments,
        packages,
        notes,
        tasks,
        programList,
        programActivityRes,
        messages,
      ]) => {
        if (!active) return;

        const usingSsrForClinical = hasSsrData && ssrSeedRef.current === userId;

        // --- Clinical (from SSR or fetch) ---
        let complaints: ActiveComplaint[];
        let clinicalStatus: WidgetStatus;
        let symptomSeries: SymptomSeries[];
        if (
          usingSsrForClinical &&
          unwrapBootstrapEnvelope(initialClinicalState) != null &&
          unwrapBootstrapEnvelope(initialVisits) != null
        ) {
          const visits = unwrapBootstrapEnvelope(initialVisits)!;
          complaints = unwrapBootstrapEnvelope(initialClinicalState)!.complaints;
          clinicalStatus = complaints.length === 0 ? 'empty' : 'ok';
          symptomSeries = buildSymptomSeries(
            complaints,
            visits.map((v) => ({
              id: v.id,
              date: v.date,
              type: v.type,
              dynamics: v.dynamics?.map((d) => ({
                id: d.id,
                label: d.label,
                from: d.from,
                to: d.to,
                note: d.note,
                priority: d.priority,
              })),
            })),
          );
        } else {
          complaints = clinical?.state?.complaints ?? [];
          clinicalStatus = !clinical ? 'error' : complaints.length === 0 ? 'empty' : 'ok';
          symptomSeries = clinical ? buildSymptomSeries(complaints, clinical.visits ?? []) : [];
        }

        // --- Appointments → Control KPI (from SSR or fetch) ---
        let controlDays: number | null;
        let controlDate: string | null;
        let appointmentsStatus: WidgetStatus;
        if (usingSsrForClinical && unwrapBootstrapEnvelope(initialAppointments) != null) {
          const upcomingAppts = unwrapBootstrapEnvelope(initialAppointments)!.filter(
            (a) => a.status === 'upcoming',
          );
          upcomingAppts.sort(
            (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
          );
          const nearestUpcoming = upcomingAppts[0] ?? null;
          controlDays = nearestUpcoming ? daysFromNow(nearestUpcoming.dateTime) : null;
          controlDate = nearestUpcoming ? fmtDateShort(nearestUpcoming.dateTime) : null;
          appointmentsStatus = nearestUpcoming === null ? 'empty' : 'ok';
        } else {
          const upcomingAppts = (appointments?.appointments ?? []).filter(
            (a) => a.status === 'upcoming',
          );
          upcomingAppts.sort(
            (a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime(),
          );
          const nearestUpcoming = upcomingAppts[0] ?? null;
          controlDays = nearestUpcoming ? daysFromNow(nearestUpcoming.dateTime) : null;
          controlDate = nearestUpcoming ? fmtDateShort(nearestUpcoming.dateTime) : null;
          appointmentsStatus = !appointments ? 'error' : nearestUpcoming === null ? 'empty' : 'ok';
        }

        // --- Packages ---
        const normalizedActivePackages = normalizeActivePackages(packages?.packages);
        const activePackage: PackageItem | null = normalizedActivePackages[0] ?? null;
        const packageStatus: WidgetStatus = !packages
          ? 'error'
          : activePackage === null
            ? 'empty'
            : 'ok';

        // --- Notes (from SSR or fetch) ---
        let notesList: DoctorNoteRow[];
        let notesStatus: WidgetStatus;
        if (usingSsrForClinical && unwrapBootstrapEnvelope(initialNotes) != null) {
          notesList = unwrapBootstrapEnvelope(initialNotes)!;
          notesStatus = 'ok';
        } else {
          notesList = notes?.notes ?? [];
          notesStatus = !notes ? 'error' : 'ok';
        }

        // --- Tasks (from SSR or fetch) ---
        let tasksList: SpecialistTaskRow[];
        let tasksStatus: WidgetStatus;
        if (usingSsrForClinical && unwrapBootstrapEnvelope(initialTasks) != null) {
          tasksList = unwrapBootstrapEnvelope(initialTasks)!.filter((t) => !t.completedAt);
          tasksStatus = 'ok';
        } else {
          tasksList = (tasks?.tasks ?? []).filter((t) => !t.completedAt);
          tasksStatus = !tasks ? 'error' : 'ok';
        }
        tasksList.sort((a, b) => {
          if (!a.dueAt && !b.dueAt) return 0;
          if (!a.dueAt) return 1;
          if (!b.dueAt) return -1;
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        });

        // --- Program — fetch active instance detail if available ---
        let programStatus: WidgetStatus = 'ok';
        let programTitle: string | null = null;
        let programStages: TreatmentInstanceStage[] = [];
        let programCurrentStage: TreatmentInstanceStage | null = null;
        let programCurrentStageIndex = 0;

        if (!programList) {
          programStatus = 'error';
        } else {
          const activeInstance = pickOpenTreatmentProgramInstance(programList.items ?? []);
          const seededProgramDetail = unwrapBootstrapEnvelope(initialProgramInstanceDetail);
          if (!activeInstance) {
            programStatus = 'empty';
          } else if (seededProgramDetail && seededProgramDetail.id === activeInstance.id) {
            const seeded = deriveOverviewProgramWidgetFromDetail(seededProgramDetail);
            programStatus = seeded.programStatus;
            programTitle = seeded.programTitle;
            programStages = seeded.programStages;
            programCurrentStage = seeded.programCurrentStage;
            programCurrentStageIndex = seeded.programCurrentStageIndex;
          } else {
            programTitle = activeInstance.title;
            try {
              const detailRes = await fetch(
                `/api/doctor/treatment-program-instances/${activeInstance.id}`,
                { credentials: 'include' },
              );
              if (detailRes.ok) {
                const detail = (await detailRes.json()) as TreatmentInstanceDetailResponse;
                if (detail.ok && detail.item) {
                  const seeded = deriveOverviewProgramWidgetFromDetail(detail.item);
                  programStatus = seeded.programStatus;
                  programTitle = seeded.programTitle;
                  programStages = seeded.programStages;
                  programCurrentStage = seeded.programCurrentStage;
                  programCurrentStageIndex = seeded.programCurrentStageIndex;
                }
              }
            } catch {
              // Non-blocking: program section degraded, show title only
              programStatus = programTitle ? 'ok' : 'error';
            }
          }
        }

        // --- Program activity (from SSR or fetch) ---
        let programActivity: DoctorPatientProgramActivity | null;
        if (usingSsrForClinical && unwrapBootstrapEnvelope(initialProgramActivity) != null) {
          programActivity = unwrapBootstrapEnvelope(initialProgramActivity);
        } else {
          programActivity = programActivityRes?.activity ?? null;
        }

        // --- Messages ---
        let messagesList: MessagesApiResponse['messages'];
        let unreadFromUserCount: number;
        let messagesStatus: WidgetStatus;
        let preserveMessagesFromPrev = false;
        if (messages.source === 'deferred') {
          preserveMessagesFromPrev = true;
          messagesList = [];
          unreadFromUserCount = 0;
          messagesStatus = 'loading';
        } else if (messages.source === 'failed') {
          messagesList = [];
          unreadFromUserCount = 0;
          messagesStatus = 'error';
        } else {
          messagesList = messages.messages ?? [];
          unreadFromUserCount = messages.unreadFromUserCount ?? 0;
          messagesStatus = 'ok';
        }

        setData((prev) => ({
          // Calendar is managed by its own effect; preserve whatever it already set (or loading default)
          calendarStatus: prev?.calendarStatus ?? 'loading',
          calendarDays: prev?.calendarDays ?? [],
          clinicalStatus,
          complaints,
          symptomSeries,
          appointmentsStatus,
          controlDays,
          controlDate,
          packageStatus,
          activePackage,
          activePackages: normalizedActivePackages,
          programStatus,
          programTitle,
          programStages,
          programCurrentStage,
          programCurrentStageIndex,
          programActivity,
          notesStatus,
          notes: notesList,
          tasksStatus,
          tasks: tasksList,
          messagesStatus: preserveMessagesFromPrev
            ? (prev?.messagesStatus ?? 'loading')
            : messagesStatus,
          messages: preserveMessagesFromPrev ? (prev?.messages ?? []) : messagesList,
          unreadFromUserCount: preserveMessagesFromPrev
            ? (prev?.unreadFromUserCount ?? 0)
            : unreadFromUserCount,
        }));
        setLoadedUserId(userId);
      },
    );

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, membershipsVisible]);

  const messagesPollGenerationRef = useRef(0);

  useEffect(() => {
    // Invalidate in-flight polls on identity/seed change without starting a duplicate fetch.
    messagesPollGenerationRef.current += 1;
  }, [userId, initialMessagesSnapshot]);

  const pollMessages = useCallback(async () => {
    const generation = ++messagesPollGenerationRef.current;
    try {
      const res = await fetch(`/api/doctor/patients/${userId}/messages-snapshot`, {
        credentials: 'include',
      });
      if (generation !== messagesPollGenerationRef.current) return;
      if (!res.ok) {
        setData((prev) =>
          prev && prev.messagesStatus === 'loading'
            ? {
                ...prev,
                messagesStatus: 'error',
              }
            : prev,
        );
        return;
      }
      const json = (await res.json()) as MessagesApiResponse;
      if (generation !== messagesPollGenerationRef.current) return;
      setData((prev) =>
        prev
          ? {
              ...prev,
              messagesStatus: 'ok',
              messages: json.messages ?? [],
              unreadFromUserCount: json.unreadFromUserCount ?? 0,
            }
          : prev,
      );
    } catch {
      if (generation !== messagesPollGenerationRef.current) return;
      setData((prev) =>
        prev && prev.messagesStatus === 'loading'
          ? {
              ...prev,
              messagesStatus: 'error',
            }
          : prev,
      );
    }
  }, [userId]);

  // SSR-ok seed: first poll after interval. Null seed: one immediate read via polling.
  // Failed seed keeps error until a later successful poll.
  const messagesPollImmediate = !isOverviewComposition && initialMessagesSnapshot == null;
  useMessagePolling(
    pollMessages,
    active && !isOverviewComposition && Boolean(userId),
    16000,
    messagesPollImmediate,
  );

  const isStale = loadedUserId !== userId;
  const isLoading = isStale || data === null;

  async function handleNoteSubmit() {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      const res = await fetch(`/api/doctor/clients/${userId}/notes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText }),
      });
      if (res.ok) {
        const json = (await res.json()) as { note?: DoctorNoteRow };
        const newNote = json.note;
        if (newNote) {
          setData((prev) => (prev ? { ...prev, notes: [newNote, ...prev.notes] } : prev));
        }
        setNoteText('');
        setNoteFormOpen(false);
      }
    } finally {
      setNoteSaving(false);
    }
  }

  function handleTaskSaved(task: SpecialistTaskRow) {
    setData((prev) => {
      if (!prev) return prev;
      const exists = prev.tasks.some((item) => item.id === task.id);
      return {
        ...prev,
        tasks: exists
          ? prev.tasks.map((item) => (item.id === task.id ? task : item))
          : [task, ...prev.tasks],
      };
    });
    setTaskFormOpen(false);
    setEditingTask(null);
  }

  // Calendar month nav helpers
  const nowCal = new Date();
  const isCalCurrentMonth = calYear === nowCal.getFullYear() && calMonth === nowCal.getMonth() + 1;
  function navigateCalMonth(delta: -1 | 1) {
    // Block navigating into future
    if (delta === 1 && isCalCurrentMonth) return;
    let m = calMonth + delta;
    let y = calYear;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (m < 1) {
      m = 12;
      y--;
    }
    setCalYear(y);
    setCalMonth(m);
  }

  const displayStageIndex = data?.programCurrentStageIndex ?? 0;
  const displayStage = data?.programCurrentStage ?? null;
  const programControlDate = displayStage
    ? expectedStageControlDateIso({
        startedAt: displayStage.startedAt ?? null,
        expectedDurationDays: displayStage.expectedDurationDays ?? null,
      })
    : null;
  const calendarGrid = buildCalendarGrid(data?.calendarDays ?? [], calYear, calMonth);
  const tasksNeedAttention =
    data?.tasks.some((task) => {
      if (isSpecialistTaskOverdue(task)) return true;
      if (!task.dueAt) return false;
      const dueAt = new Date(task.dueAt);
      const today = new Date();
      return (
        dueAt.getFullYear() === today.getFullYear() &&
        dueAt.getMonth() === today.getMonth() &&
        dueAt.getDate() === today.getDate()
      );
    }) ?? false;

  function handleCalendarTouchEnd(clientX: number) {
    const startX = calendarSwipeStartXRef.current;
    calendarSwipeStartXRef.current = null;
    if (startX == null) return;
    const delta = clientX - startX;
    if (Math.abs(delta) < 48) return;
    if (delta > 0) navigateCalMonth(-1);
    if (delta < 0 && !isCalCurrentMonth) navigateCalMonth(1);
  }

  const exerciseCalendar = (
    <div
      className="mt-3 border-t border-border/60 pt-3"
      onTouchStart={(event) => {
        calendarSwipeStartXRef.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => handleCalendarTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
    >
      <div className="mb-1.5 flex items-center gap-1.5" data-testid="cal-month-nav">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Предыдущий месяц"
          data-testid="cal-month-prev"
          onClick={() => navigateCalMonth(-1)}
          className="size-7 p-0 text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span
          className="flex-1 text-center text-xs font-medium capitalize text-foreground"
          data-testid="cal-month-label"
        >
          {monthLabelFor(calYear, calMonth)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Следующий месяц"
          data-testid="cal-month-next"
          onClick={() => navigateCalMonth(1)}
          disabled={isCalCurrentMonth}
          className="size-7 p-0 text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {isLoading || data?.calendarStatus === 'loading' ? (
        <p className="animate-pulse py-2 text-xs text-muted-foreground">Загрузка календаря…</p>
      ) : null}
      {!isLoading && data?.calendarStatus === 'error' ? (
        <p className="py-2 text-xs text-muted-foreground">Данные о выполнении недоступны.</p>
      ) : null}
      {!isLoading && data?.calendarStatus === 'ok' ? (
        <>
          <div className="mb-0.5 grid grid-cols-7 gap-0.5">
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((day) => (
              <div
                key={day}
                className="flex h-4 items-center justify-center text-[10px] uppercase text-muted-foreground/70"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: calendarGrid.firstDOW }).map((_, index) => (
              <div key={`blank-${index}`} />
            ))}
            {calendarGrid.days.map((day) => (
              <CalendarCell key={day.day} day={day} />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-primary" />
              Полностью
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm bg-[hsl(215_45%_76%)]" />
              Частично
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm border border-border bg-background" />
              Не выполнено
            </span>
          </div>
        </>
      ) : null}
    </div>
  );

  // Message unread count
  const totalMessageUnread = data?.unreadFromUserCount ?? 0;

  return (
    <div
      className={cn(
        compositionMode === 'right-pane'
          ? 'flex flex-col gap-2.5'
          : isOverviewComposition
            ? 'grid grid-cols-2 items-start gap-2.5'
            : 'grid grid-cols-1 items-start gap-2.5 md:grid-cols-2',
      )}
    >
      {/* ===== LEFT COLUMN ===== */}
      <div className={cn(isComposed ? 'contents' : 'flex flex-col gap-2.5')}>
        {/* «+ Создать визит» entry point */}
        <div className={cn('flex justify-end', isComposed && 'hidden')}>
          <Button
            variant="ghost"
            onClick={() => onTabSwitch?.('karta')}
            className="h-auto rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20"
          >
            + Создать визит
          </Button>
        </div>

        {/* KPI row */}
        <div className={cn('grid grid-cols-2 gap-2', isComposed && 'hidden')}>
          {/* Контроль KPI */}
          <KpiCard
            id="patient-overview-kpi-control"
            label="Контроль"
            loading={isLoading}
            value={
              data?.appointmentsStatus === 'empty' || data?.controlDays === null
                ? '—'
                : data?.controlDays !== undefined && data.controlDays <= 0
                  ? 'сегодня'
                  : `через ${data?.controlDays} дн`
            }
            hint={
              data?.controlDate
                ? `следующий визит · ${data.controlDate}`
                : 'нет предстоящих записей'
            }
          />
          {membershipsVisible ? (
            <KpiCard
              id="patient-overview-kpi-membership"
              label="Абонемент"
              loading={isLoading}
              value={
                data?.packageStatus === 'empty' || !data?.activePackage
                  ? '—'
                  : (() => {
                      const activePackages =
                        data.activePackages.length > 0 ? data.activePackages : [data.activePackage];
                      const totals = activePackages.map(summarizePackageBalance);
                      const remaining = totals.every((total) => total.remaining != null)
                        ? totals.reduce((sum, total) => sum + (total.remaining ?? 0), 0)
                        : null;
                      return remaining == null
                        ? 'Осталось — визитов:'
                        : `Осталось ${remaining} визитов:`;
                    })()
              }
              hint={
                data?.packageStatus === 'empty'
                  ? 'абонемент не активен'
                  : (data?.activePackages ?? []).length > 0
                    ? (data?.activePackages ?? []).map(formatOverviewPackageSummary).join(', ')
                    : 'осталось занятий'
              }
            />
          ) : null}
        </div>

        {/* Актуальные симптомы */}
        <div className={cn(doctorSectionCardClass, isComposed && 'hidden')}>
          <div className="flex items-center justify-between mb-1">
            <span className={doctorSectionTitleClass}>Актуальные симптомы</span>
            <Button
              variant="ghost"
              onClick={() => onTabSwitch?.('karta')}
              className="h-auto rounded px-2 py-0.5 text-xs font-medium text-primary bg-primary/8 hover:bg-primary/15 gap-0.5"
            >
              Открыть Карту →
            </Button>
          </div>

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка симптомов…</p>
          )}
          {!isLoading && data?.clinicalStatus === 'error' && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить симптомы.</p>
          )}
          {!isLoading && data?.clinicalStatus === 'empty' && (
            <p className="text-xs text-muted-foreground py-2">Симптомы не зафиксированы.</p>
          )}

          {!isLoading && data?.clinicalStatus === 'ok' && (
            <>
              {data.complaints
                .filter((c) => c.priority)
                .map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center gap-2 border border-[#ecd9d5] bg-[#fbf5f4] rounded-lg px-3 py-2"
                  >
                    <span className="text-base flex-none">⚑</span>
                    <span className="text-sm font-semibold text-foreground flex-1 min-w-0">
                      {c.text}
                    </span>
                    <ScoreBadge score={c.currentSeverity} size="base" />
                    <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                      {c.since}
                      {c.trend.length >= 2 && ` · было ${c.trend[0]}/10`}
                    </span>
                  </div>
                ))}

              {data.complaints
                .filter((c) => !c.priority)
                .map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 mt-1 px-3 text-xs text-muted-foreground"
                  >
                    <span className="w-3.5 flex-none" />
                    <span className="flex-1 min-w-0">{c.text}</span>
                    <ScoreBadge score={c.currentSeverity} size="sm" />
                    <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
                      {c.since}
                    </span>
                  </div>
                ))}
            </>
          )}
        </div>

        {/* Динамика симптомов */}
        {isLoading || data?.symptomSeries.some((series) => series.points.length >= 2) ? (
          <div
            className={cn(
              doctorSectionCardClass,
              compositionMode === 'right-pane' && 'order-3',
              isOverviewComposition && 'order-2 col-span-2',
            )}
          >
            <div className="flex items-center justify-between flex-wrap gap-1.5 mb-1">
              <span className={doctorSectionTitleClass}>Динамика симптомов</span>
              {!isLoading && data?.symptomSeries && data.symptomSeries.length > 0 && (
                <span className="flex gap-2.5 items-center">
                  {data.symptomSeries
                    .filter((series) => series.points.length >= 2)
                    .map((s) => (
                      <span
                        key={s.name}
                        className="flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm flex-none"
                          style={{ background: s.color }}
                        />
                        {s.name}
                      </span>
                    ))}
                </span>
              )}
            </div>
            {isLoading && (
              <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка данных…</p>
            )}
            {!isLoading &&
              data?.symptomSeries &&
              data.symptomSeries.some((s) => s.points.length >= 2) && (
                <SymptomChart series={data.symptomSeries} />
              )}
          </div>
        ) : null}
      </div>

      {/* ===== RIGHT COLUMN ===== */}
      <div className={cn(isComposed ? 'contents' : 'flex flex-col gap-2.5')}>
        {/* Заметки */}
        <section className={cn(isComposed && 'order-1')} aria-label="Заметки">
          <DoctorStatCard
            id="patient-overview-notes"
            title="Заметок"
            value={data?.notes.length ?? 0}
            onClick={() => setNotesModalOpen(true)}
            valuePlacement="inline"
            actionIcon={<FilePlus2 className="size-5" aria-hidden />}
            actionLabel="Добавить заметку"
            onActionClick={() => {
              setNoteText('');
              setNoteFormOpen(true);
            }}
            className="h-full border-primary/30"
          />

          <DoctorModal
            open={notesModalOpen}
            onClose={() => setNotesModalOpen(false)}
            title="Заметки"
            size="lg"
            bodyVariant="list"
            desktopPresentation="right-sheet"
          >
            <div className="flex justify-end px-4 pb-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setNoteText('');
                  setNoteFormOpen(true);
                }}
              >
                Добавить
              </Button>
            </div>
            {isLoading ? (
              <p className="animate-pulse px-4 py-2 text-sm text-muted-foreground">
                Загрузка заметок…
              </p>
            ) : data?.notesStatus === 'error' ? (
              <p className="px-4 py-2 text-sm text-destructive">Не удалось загрузить заметки.</p>
            ) : data?.notes.length ? (
              <DoctorDnaFlatList>
                {[...data.notes]
                  .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                  .map((note) => (
                    <li key={note.id} className={`${doctorDnaFlatListRowClass} justify-between`}>
                      <span
                        className={`${doctorDnaFlatListPrimaryClass} min-w-0 whitespace-pre-wrap`}
                      >
                        {note.text}
                      </span>
                      <span className={`${doctorDnaFlatListMetaClass} shrink-0 tabular-nums`}>
                        {fmtDateMsgShort(note.updatedAt)}
                      </span>
                    </li>
                  ))}
              </DoctorDnaFlatList>
            ) : (
              <DoctorEmptyState>Заметок нет</DoctorEmptyState>
            )}
          </DoctorModal>

          <DoctorModal
            open={noteFormOpen}
            onClose={() => setNoteFormOpen(false)}
            title="Новая заметка"
            size="sm"
            footer={
              <>
                <Button type="button" variant="outline" onClick={() => setNoteFormOpen(false)}>
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleNoteSubmit()}
                  disabled={noteSaving || !noteText.trim()}
                >
                  {noteSaving ? 'Сохранение…' : 'Сохранить'}
                </Button>
              </>
            }
          >
            <Textarea
              autoFocus
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              rows={5}
              placeholder="Текст заметки…"
              className="resize-none"
            />
          </DoctorModal>
        </section>

        {/* Задачи */}
        {specialistTasksReadable ? (
          <section
            className={cn(
              compositionMode === 'right-pane' && 'order-2',
              isOverviewComposition && 'order-1',
            )}
            aria-label="Задачи"
          >
            <DoctorStatCard
              id="patient-overview-tasks"
              title="Задач"
              value={data?.tasks.length ?? 0}
              tone={tasksNeedAttention ? 'warning' : 'neutral'}
              valueClassName={tasksNeedAttention ? 'text-destructive' : undefined}
              onClick={() => setTasksModalOpen(true)}
              valuePlacement="inline"
              actionIcon={<ListPlus className="size-5" aria-hidden />}
              actionLabel="Добавить задачу"
              onActionClick={() => {
                setEditingTask(null);
                setTaskFormOpen(true);
              }}
              className="h-full border-primary/30"
            />

            <DoctorModal
              open={tasksModalOpen}
              onClose={() => setTasksModalOpen(false)}
              title="Задачи"
              size="lg"
              bodyVariant="list"
              desktopPresentation="right-sheet"
            >
              {specialistTasksAvailable ? (
                <div className="flex justify-end px-4 pb-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditingTask(null);
                      setTaskFormOpen(true);
                    }}
                  >
                    <ListPlus className="size-4" aria-hidden />
                    Добавить
                  </Button>
                </div>
              ) : null}
              {isLoading ? (
                <p className="animate-pulse px-4 py-2 text-sm text-muted-foreground">
                  Загрузка задач…
                </p>
              ) : data?.tasksStatus === 'error' ? (
                <p className="px-4 py-2 text-sm text-destructive">Не удалось загрузить задачи.</p>
              ) : data?.tasks.length ? (
                <DoctorDnaFlatList>
                  {data.tasks.map((task) => {
                    const isOverdue = task.dueAt ? new Date(task.dueAt) < new Date() : false;
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          className={`${doctorDnaFlatListRowClass} ${doctorDnaFlatListClickableClass} w-full justify-between text-left`}
                          onClick={() => {
                            setEditingTask(task);
                            setTaskFormOpen(true);
                          }}
                        >
                          <span className={`${doctorDnaFlatListPrimaryClass} min-w-0 truncate`}>
                            {task.title}
                          </span>
                          {task.dueAt ? (
                            <span
                              className={cn(
                                doctorDnaFlatListMetaClass,
                                'shrink-0 tabular-nums',
                                isOverdue && 'text-destructive',
                              )}
                            >
                              {fmtDateShort(task.dueAt)}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </DoctorDnaFlatList>
              ) : (
                <DoctorEmptyState>Задач нет</DoctorEmptyState>
              )}
            </DoctorModal>

            <SpecialistTaskFormDialog
              open={taskFormOpen}
              onOpenChange={(open) => {
                setTaskFormOpen(open);
                if (!open) setEditingTask(null);
              }}
              patientUserId={userId}
              editing={editingTask}
              onSaved={handleTaskSaved}
            />
          </section>
        ) : null}

        {/* Программа ЛФК */}
        <div
          className={cn(
            doctorSectionCardClass,
            compositionMode === 'right-pane' && 'order-4',
            isOverviewComposition && 'order-3 col-span-2',
          )}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className={doctorSectionTitleClass}>Программа ЛФК</span>
            {(data?.programActivity?.unreadCount ?? 0) > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {data!.programActivity!.unreadCount} непрочитанных
              </span>
            )}
          </div>

          {isLoading && (
            <p className="text-xs text-muted-foreground animate-pulse py-2">Загрузка программы…</p>
          )}
          {!isLoading && data?.programStatus === 'error' && (
            <p className="text-xs text-destructive py-1">Не удалось загрузить программу.</p>
          )}
          {!isLoading && data?.programStatus === 'empty' && (
            <p className="text-xs text-muted-foreground py-2">Программа не назначена.</p>
          )}

          {!isLoading && data?.programStatus === 'ok' && (
            <>
              {data.programTitle && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onTabSwitch?.('program')}
                  className="mb-1.5 h-auto p-0 text-base font-normal text-foreground hover:bg-transparent hover:text-primary"
                >
                  {data.programTitle}
                </Button>
              )}
              {programControlDate ? (
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Дата контроля: {fmtDateShort(programControlDate)}
                </p>
              ) : null}

              {displayStage ? (
                <div className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-2">
                  <p className="w-full text-sm font-medium text-foreground">
                    Этап {displayStageIndex + 1} · {displayStage.title}
                  </p>
                </div>
              ) : null}
              {exerciseCalendar}
            </>
          )}
        </div>

        {/* Сопровождение — moved here from Учётка (S2.5) */}
        {!isComposed ? (
          <div className={doctorSectionCardClass}>
            <span className={doctorSectionTitleClass}>Сопровождение</span>
            <DoctorClientSupportPanel
              patientUserId={userId}
              initialEffectivePolicy={unwrapBootstrapEnvelope(initialSupportEffectivePolicy)}
            />
          </div>
        ) : null}

        {/* Сообщения */}
        {!isComposed ? (
          <div className={doctorSectionCardClass}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={doctorSectionTitleClass}>Сообщения</span>
              {totalMessageUnread > 0 && (
                <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0 text-[10px] font-semibold text-destructive">
                  {totalMessageUnread} новых
                </span>
              )}
              <Button
                variant="ghost"
                onClick={() => onTabSwitch?.('karta')}
                className="ml-auto h-auto p-0 text-xs text-muted-foreground hover:text-primary hover:bg-transparent"
              >
                вся переписка →
              </Button>
            </div>

            {isLoading && (
              <p className="text-xs text-muted-foreground animate-pulse py-2">
                Загрузка сообщений…
              </p>
            )}
            {!isLoading && data?.messagesStatus === 'error' && (
              <p className="text-xs text-destructive py-1">Не удалось загрузить сообщения.</p>
            )}
            {!isLoading && data?.messagesStatus === 'ok' && data.messages.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">Сообщений нет.</p>
            )}
            {!isLoading && data?.messagesStatus === 'ok' && data.messages.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {[...data.messages]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 5)
                  .map((msg) => {
                    const isUnread = !msg.readAt && msg.senderRole !== 'admin';
                    const isPatient = msg.senderRole !== 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          doctorBodyTextClass,
                          'flex gap-1.5 items-start rounded-lg px-2.5 py-1.5',
                          isUnread
                            ? 'border border-primary bg-primary/5'
                            : 'border border-border bg-muted/10',
                          !isPatient && 'text-muted-foreground',
                        )}
                      >
                        <span className="flex-1 min-w-0">
                          <strong>{isPatient ? 'Пациент' : 'Вы'}:</strong> {msg.text}
                        </span>
                        <span
                          className={cn(doctorMetaTextClass, 'whitespace-nowrap ml-auto pl-1.5')}
                        >
                          {fmtDateMsgShort(msg.createdAt)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar grid builder — converts API days to renderable cells
// ---------------------------------------------------------------------------

interface CalendarGrid {
  firstDOW: number; // blank cells before day 1 (0 = Mon)
  days: CalendarCellData[];
}

/** Build renderable calendar cells for the given year+month (1-based). */
function buildCalendarGrid(
  apiDays: CalendarDay[],
  viewYear: number,
  viewMonth: number,
): CalendarGrid {
  const now = new Date();
  const todayYear = now.getFullYear();
  const todayMonthIdx = now.getMonth(); // 0-based
  const todayDay = now.getDate();

  // viewMonth is 1-based; convert for Date constructor (month arg is 0-based)
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate(); // day 0 of month+1

  // First day of week offset (Mon = 0): getDay() returns 0=Sun, 1=Mon, …6=Sat
  const firstOfMonth = new Date(viewYear, viewMonth - 1, 1);
  const jsDay = firstOfMonth.getDay(); // 0=Sun
  const firstDOW = jsDay === 0 ? 6 : jsDay - 1; // convert to Mon-based

  // Is the viewed month the current real month?
  const isCurrentMonth = viewYear === todayYear && viewMonth - 1 === todayMonthIdx;

  // Build lookup by day number (1-31)
  const completedByDay = new Map<number, number>();
  for (const apiDay of apiDays) {
    const d = parseInt(apiDay.date.slice(8, 10), 10);
    completedByDay.set(d, (completedByDay.get(d) ?? 0) + apiDay.completedCount);
  }

  const days: CalendarCellData[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const completedCount = completedByDay.get(d);
    let status: CalendarCellData['status'];

    // For a past month — all days are past; for current month — use today boundary
    const isPast = !isCurrentMonth || d < todayDay;
    const isToday = isCurrentMonth && d === todayDay;
    const isFuture = isCurrentMonth && d > todayDay;

    if (isFuture) {
      status = 'future';
    } else if (isToday) {
      status = 'today';
    } else if (isPast && completedCount === undefined) {
      status = 'no-assign';
    } else if (!isPast && completedCount === undefined) {
      status = 'future';
    } else if ((completedCount ?? 0) >= 3) {
      status = 'full';
    } else if ((completedCount ?? 0) >= 1) {
      status = 'partial';
    } else {
      status = 'missed';
    }

    days.push({
      day: d,
      status,
      ratio: completedCount ? Math.min(completedCount / 3, 1) : undefined,
    });
  }

  return { firstDOW, days };
}
