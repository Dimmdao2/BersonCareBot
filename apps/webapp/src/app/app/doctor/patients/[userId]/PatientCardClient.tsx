'use client';

/**
 * PatientCardClient — organization card with four product tabs.
 * Tabs are rendered once and shown/hidden client-side (no server re-fetch per tab).
 *
 * Header: FIO display with inline edit. All other editing lives in the «Учётка» tab.
 */
import { useState, useEffect, useCallback, Suspense, use, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { PatientCardHeader, PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import type { AnamnesisState, ClinicalState, Visit } from '@/modules/patient-clinical/ports';
import type { Comorbidity } from '@/modules/patient-comorbidities/ports';
import type { DoctorNoteRow } from '@/modules/doctor-notes/ports';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import type { DoctorPatientProgramActivity } from '../loadDoctorPatientProgramActivity';
import type {
  TreatmentProgramInstanceSummary,
  TreatmentProgramInstanceDetail,
} from '@/modules/treatment-program/types';
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
  doctorPageStackClass,
} from '@/shared/ui/doctor/doctorVisual';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { cn } from '@/lib/utils';
import { MessageSquare, Send, Smartphone, Mail, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { DoctorOpenChatButton } from '@/shared/ui/doctor/DoctorOpenChatButton';
import { formatDoctorFio } from '@/shared/lib/fio';
import type { DoctorPatientExerciseCalendarSnapshot } from '../loadDoctorPatientExerciseCalendar';
import type { DoctorPatientMessagesSnapshot } from '../loadDoctorPatientMessagesSnapshot';
import type {
  DoctorPatientCardShellMeta,
  DoctorPatientCardTabBootstrap,
} from '../loadDoctorPatientCardPageBootstrap';
import { unwrapBootstrapEnvelope } from '../doctorPatientCardBootstrapShared';
import type { AppointmentPrefill } from './tabs/PatientTabRecords';
import type { FileRecord } from './tabs/PatientTabFiles';
import type { SupplementaryContact } from './tabs/PatientTabAccount';
import type { PatientProgramInteractionPolicy } from '@/modules/doctor-clients/supportPolicy';
import type { PatientPortalStatus } from '@/modules/patient-invites/ports';
import { PatientPortalInviteControls } from './PatientPortalInviteControls';
import { DoctorClientMembershipsPanel } from '@/app/app/doctor/clients/DoctorClientMembershipsPanel';

function PatientTabPanelLoading() {
  return (
    <div className={cn(doctorSectionCardClass, 'gap-3')} aria-busy="true">
      <div className="h-24 animate-pulse rounded-lg bg-muted/70" />
      <span className="sr-only">Загрузка вкладки…</span>
    </div>
  );
}

const PatientTabOverview = dynamic(
  () => import('./tabs/PatientTabOverview').then((m) => ({ default: m.PatientTabOverview })),
  { loading: () => <PatientTabPanelLoading /> },
);
const PatientTabKarta = dynamic(
  () => import('./tabs/PatientTabKarta').then((m) => ({ default: m.PatientTabKarta })),
  { loading: () => <PatientTabPanelLoading /> },
);
const PatientTabProgram = dynamic(
  () => import('./tabs/PatientTabProgram').then((m) => ({ default: m.PatientTabProgram })),
  { loading: () => <PatientTabPanelLoading /> },
);
const PatientTabRecords = dynamic(
  () => import('./tabs/PatientTabRecords').then((m) => ({ default: m.PatientTabRecords })),
  { loading: () => <PatientTabPanelLoading /> },
);
const PatientTabFiles = dynamic(
  () => import('./tabs/PatientTabFiles').then((m) => ({ default: m.PatientTabFiles })),
  { loading: () => <PatientTabPanelLoading /> },
);
const PatientTabAccount = dynamic(
  () => import('./tabs/PatientTabAccount').then((m) => ({ default: m.PatientTabAccount })),
  { loading: () => <PatientTabPanelLoading /> },
);

type Props = {
  shellMeta: DoctorPatientCardShellMeta;
  tabPromise: Promise<DoctorPatientCardTabBootstrap>;
  initialTab?: string;
  createVisitFrom?: string;
  visitDate?: string;
  /** When set, renders this node in place of PatientTabProgram in the Программа tab. */
  embeddedProgramContent?: ReactNode;
  /** Whether the viewer is an admin — gates the «Администрирование» section in PatientTabAccount. */
  isAdmin?: boolean;
  /** Sanitized return href to the clients list — «К клиентам» link in the page header. */
  patientListHref: string;
};

type TabPanelsProps = Props & {
  activeTab: TabId;
  visitedTabs: ReadonlySet<TabId>;
  selectTab: (tab: TabId) => void;
  pendingAppointmentId: string | null;
  pendingVisitDate: string | null;
  pendingPrefillLocation: string | null;
  pendingPrefillService: string | null;
  pendingPrefillDurationMin: number | null;
  onPendingConsumed: () => void;
  onCreateVisitFromAppointment: (prefill: AppointmentPrefill) => void;
  header: NonNullable<DoctorPatientCardShellMeta['cardHeader']>;
};

type TabId = 'karta' | 'program' | 'files' | 'account';

const PATIENT_TABS: Array<{ id: TabId; label: string; badge?: number }> = [
  { id: 'karta', label: 'Карточка' },
  { id: 'program', label: 'Программа' },
  { id: 'files', label: 'Файлы' },
  { id: 'account', label: 'Учётка' },
];

/**
 * Вкладки карточки пациента в слоте `tabs` `DoctorPageHeader` — тот же паттерн, что
 * Расписание/Аналитика/Коммуникации (`doctorSectionTabClass`). Заменяет прежнюю внутреннюю
 * полосу вкладок внутри identity-карточки (owner correction 2026-08-20).
 */
function PatientCardTabsNav({
  activeTab,
  onTabClick,
}: {
  activeTab: TabId;
  onTabClick: (tab: TabId) => void;
}) {
  return (
    <nav
      id="doctor-patient-card-tabs"
      aria-label="Разделы карточки пациента"
      className="flex gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {PATIENT_TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Button
            key={tab.id}
            type="button"
            variant="ghost"
            aria-current={active ? 'page' : undefined}
            onClick={() => onTabClick(tab.id)}
            className={doctorSectionTabClass(active)}
          >
            {tab.label}
            {tab.badge != null && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                  active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {tab.badge}
              </span>
            )}
          </Button>
        );
      })}
    </nav>
  );
}

/** Format ISO date yyyy-mm-dd → DD.MM.YYYY */
function fmtBirthDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '—';
  return `${day}.${month}.${year}`;
}

function todayInputDate(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function phoneHref(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return `tel:${normalized || phone}`;
}

export function PatientCardClient({
  shellMeta,
  tabPromise,
  initialTab,
  createVisitFrom,
  visitDate,
  embeddedProgramContent,
  isAdmin = false,
  patientListHref,
}: Props) {
  const header = shellMeta.cardHeader;
  const resolvedInitialTab: TabId =
    initialTab && PATIENT_TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : 'karta';
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(
    () => new Set<TabId>([resolvedInitialTab]),
  );
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(
    createVisitFrom ?? null,
  );
  const [pendingVisitDate, setPendingVisitDate] = useState<string | null>(visitDate ?? null);
  const [pendingPrefillLocation, setPendingPrefillLocation] = useState<string | null>(null);
  const [pendingPrefillService, setPendingPrefillService] = useState<string | null>(null);
  const [pendingPrefillDurationMin, setPendingPrefillDurationMin] = useState<number | null>(null);

  const selectTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

  // FIO inline edit state
  const [fioEditing, setFioEditing] = useState(false);
  const [fioSaving, setFioSaving] = useState(false);
  const [fioError, setFioError] = useState<string | null>(null);
  // Local overrides applied after a successful save (avoids full page reload)
  const [fioOverride, setFioOverride] = useState<{
    firstName: string | null;
    lastName: string | null;
    patronymic: string | null;
    birthDate?: string | null;
  } | null>(null);
  // Draft input values
  const [fioLastName, setFioLastName] = useState('');
  const [fioFirstName, setFioFirstName] = useState('');
  const [fioPatronymic, setFioPatronymic] = useState('');
  const [fioBirthDate, setFioBirthDate] = useState('');

  // Auto-switch to karta tab when opening with createVisitFrom URL param
  useEffect(() => {
    if (createVisitFrom) selectTab('karta');
  }, [createVisitFrom, selectTab]);

  // Listen for cross-tab navigation events dispatched by child tabs (e.g. «Оформить визит» → Карта)
  useEffect(() => {
    function handleOpenTab(e: Event) {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab as TabId | undefined;
      if (tab && PATIENT_TABS.some((t) => t.id === tab)) {
        selectTab(tab);
      }
    }
    window.addEventListener('patient:open-tab', handleOpenTab);
    return () => window.removeEventListener('patient:open-tab', handleOpenTab);
  }, [selectTab]);

  if (!header) {
    return (
      <>
        <DoctorPageHeader
          id="doctor-patient-card-header"
          title="Карточка пациента"
          tabs={
            <Link
              href={patientListHref}
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'h-8 rounded-[var(--doctor-control-radius,24px)] px-3',
              )}
            >
              К клиентам
            </Link>
          }
        />
        <section className={doctorPageStackClass}>
          <div className={doctorSectionCardClass}>
            <p className="text-sm text-muted-foreground">Пациент не найден.</p>
          </div>
        </section>
      </>
    );
  }

  const { identity, support } = header;

  // Resolved FIO: local override wins over server data
  const resolvedFirstName = fioOverride ? fioOverride.firstName : identity.firstName;
  const resolvedLastName = fioOverride ? fioOverride.lastName : identity.lastName;
  const resolvedPatronymic = fioOverride ? fioOverride.patronymic : identity.patronymic;
  const resolvedBirthDate =
    fioOverride?.birthDate !== undefined ? fioOverride.birthDate : identity.birthDate;
  const fioDisplay = formatDoctorFio(
    { lastName: resolvedLastName, firstName: resolvedFirstName, patronymic: resolvedPatronymic },
    identity.displayName || '—',
  );

  function openFioEdit() {
    setFioLastName(resolvedLastName ?? '');
    setFioFirstName(resolvedFirstName ?? '');
    setFioPatronymic(resolvedPatronymic ?? '');
    setFioBirthDate(resolvedBirthDate ?? '');
    setFioError(null);
    setFioEditing(true);
  }

  function cancelFioEdit() {
    setFioEditing(false);
    setFioError(null);
  }

  async function saveFio() {
    setFioSaving(true);
    setFioError(null);
    try {
      const res = await fetch(`/api/doctor/patients/${identity.userId}/fio`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastName: fioLastName.trim() || null,
          firstName: fioFirstName.trim() || null,
          patronymic: fioPatronymic.trim() || null,
          birthDate: fioBirthDate.trim() || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        const body = json as { error?: string; message?: string } | null;
        setFioError(body?.message ?? body?.error ?? 'Ошибка сохранения');
        return;
      }
      // Apply local override to avoid page reload
      setFioOverride({
        lastName: fioLastName.trim() || null,
        firstName: fioFirstName.trim() || null,
        patronymic: fioPatronymic.trim() || null,
        birthDate: fioBirthDate.trim() || null,
      });
      setFioEditing(false);
    } catch {
      setFioError('Ошибка сети');
    } finally {
      setFioSaving(false);
    }
  }

  const hasTelegram = Boolean(identity.bindings.telegramId);
  const hasMax = Boolean(identity.bindings.maxId);
  const hasEmail = Boolean(identity.email);
  const hasConversationSignal = Boolean(identity.hasConversation);
  const chatButtonHighlighted = hasTelegram || hasMax || hasConversationSignal;

  return (
    <>
      <DoctorPageHeader
        id="doctor-patient-card-header"
        title="Карточка пациента"
        tabs={
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={patientListHref}
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'h-8 shrink-0 rounded-[var(--doctor-control-radius,24px)] px-3',
              )}
            >
              К клиентам
            </Link>
            <PatientCardTabsNav activeTab={activeTab} onTabClick={selectTab} />
          </div>
        }
      />
      <section className={cn(doctorPageStackClass, 'flex flex-col gap-3')}>
        {/* ================================================================
          IDENTITY HEADER CARD — READ ONLY
          Displaying patient identity; all edits live in «Учётка» tab.
          Tab navigation lives in DoctorPageHeader's tabs slot above.
      ================================================================ */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Main header body */}
          <div className="px-4 pt-3.5 pb-2.5 flex flex-wrap gap-3.5 items-start">
            {/* LEFT: identity */}
            <div className="flex-1 min-w-0 flex flex-col gap-0">
              {/* FIO (primary) + edit button + support chip */}
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  {/* FIO row */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-base font-bold text-foreground leading-tight">
                      {fioDisplay}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Редактировать ФИО"
                      onClick={openFioEdit}
                      className="ml-0.5 h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {support.isOnSupport && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      ★ На сопровождении
                      {support.supportMonthsApprox != null && (
                        <> · {support.supportMonthsApprox} мес</>
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Inline FIO edit form */}
              {fioEditing && (
                <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Фамилия
                      </label>
                      <Input
                        type="text"
                        value={fioLastName}
                        onChange={(e) => setFioLastName(e.target.value)}
                        placeholder="Иванов"
                        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Имя
                      </label>
                      <Input
                        type="text"
                        value={fioFirstName}
                        onChange={(e) => setFioFirstName(e.target.value)}
                        placeholder="Иван"
                        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Отчество
                      </label>
                      <Input
                        type="text"
                        value={fioPatronymic}
                        onChange={(e) => setFioPatronymic(e.target.value)}
                        placeholder="Иванович"
                        className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Дата рождения
                      </label>
                      <DoctorDatePicker
                        value={fioBirthDate}
                        onChange={setFioBirthDate}
                        placeholder="Не указана"
                        max={todayInputDate()}
                      />
                    </div>
                  </div>
                  {fioError && <p className="text-xs text-destructive">{fioError}</p>}
                  <div className="flex gap-2 mt-0.5">
                    <Button
                      variant="default"
                      onClick={saveFio}
                      disabled={fioSaving}
                      className="h-auto gap-1 rounded-md px-3 py-1 text-xs font-medium disabled:opacity-60"
                    >
                      <Check className="h-3 w-3" />
                      {fioSaving ? 'Сохранение…' : 'Сохранить'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={cancelFioEdit}
                      disabled={fioSaving}
                      className="h-auto gap-1 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 disabled:opacity-60"
                    >
                      <X className="h-3 w-3" />
                      Отмена
                    </Button>
                  </div>
                </div>
              )}

              {/* Дата рождения — read-only; edit via pencil */}
              <div className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>
                  Дата рождения: {resolvedBirthDate ? fmtBirthDate(resolvedBirthDate) : '—'}
                </span>
              </div>

              {/* Phone + channel icons */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {identity.phone ? (
                  <Button
                    type="button"
                    variant="ghost"
                    title="Позвонить"
                    onClick={() => {
                      window.open(phoneHref(identity.phone!), '_self');
                    }}
                    className="h-6 rounded-md border border-primary/30 bg-primary/5 px-2 font-mono text-xs text-primary hover:bg-primary/15"
                  >
                    {identity.phone}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground font-mono">—</span>
                )}

                {/* Channel icon buttons — lucide-react icons; active = colored, inactive = muted */}
                <span className="flex gap-1">
                  <DoctorOpenChatButton
                    patientUserId={identity.userId}
                    patientName={identity.displayName ?? undefined}
                    variant="ghost"
                    size="icon"
                    title="Открыть чат"
                    className={cn(
                      'h-6 w-6 rounded-md border text-xs',
                      chatButtonHighlighted
                        ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                        : 'border-transparent bg-muted/30 text-muted-foreground/40 hover:bg-primary/15 hover:text-primary',
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </DoctorOpenChatButton>
                  <DoctorOpenChatButton
                    patientUserId={identity.userId}
                    patientName={identity.displayName ?? undefined}
                    variant="ghost"
                    size="icon"
                    title={hasTelegram ? 'Открыть коммуникации: Telegram' : 'Telegram не привязан'}
                    disabled={!hasTelegram}
                    className={cn(
                      'h-6 w-6 rounded-md border text-xs',
                      hasTelegram
                        ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                        : 'border-transparent bg-muted/30 text-muted-foreground/40',
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </DoctorOpenChatButton>
                  <DoctorOpenChatButton
                    patientUserId={identity.userId}
                    patientName={identity.displayName ?? undefined}
                    variant="ghost"
                    size="icon"
                    title={hasMax ? 'Открыть коммуникации: MAX' : 'MAX не привязан'}
                    disabled={!hasMax}
                    className={cn(
                      'h-6 w-6 rounded-md border text-xs',
                      hasMax
                        ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                        : 'border-transparent bg-muted/30 text-muted-foreground/40',
                    )}
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                  </DoctorOpenChatButton>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Написать email"
                    disabled={!hasEmail}
                    onClick={() => {
                      if (identity.email) window.open(`mailto:${identity.email}`, '_self');
                    }}
                    className={cn(
                      'h-6 w-6 rounded-md border text-xs',
                      hasEmail
                        ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                        : 'border-transparent bg-muted/30 text-muted-foreground/40',
                    )}
                  >
                    <Mail className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
              <PatientPortalInviteControls
                patientUserId={identity.userId}
                initialState={{ status: 'not_activated', inviteId: null, expiresAt: null }}
              />
            </div>
          </div>
        </div>

        {/* TAB PANELS — mount on first visit; tab data streams in via Suspense. */}
        <Suspense fallback={<PatientTabPanelLoading />}>
          <PatientCardTabPanels
            shellMeta={shellMeta}
            tabPromise={tabPromise}
            initialTab={initialTab}
            createVisitFrom={createVisitFrom}
            visitDate={visitDate}
            embeddedProgramContent={embeddedProgramContent}
            isAdmin={isAdmin}
            patientListHref={patientListHref}
            activeTab={activeTab}
            visitedTabs={visitedTabs}
            selectTab={selectTab}
            pendingAppointmentId={pendingAppointmentId}
            pendingVisitDate={pendingVisitDate}
            pendingPrefillLocation={pendingPrefillLocation}
            pendingPrefillService={pendingPrefillService}
            pendingPrefillDurationMin={pendingPrefillDurationMin}
            onPendingConsumed={() => {
              setPendingAppointmentId(null);
              setPendingVisitDate(null);
              setPendingPrefillLocation(null);
              setPendingPrefillService(null);
              setPendingPrefillDurationMin(null);
            }}
            onCreateVisitFromAppointment={(prefill: AppointmentPrefill) => {
              setPendingAppointmentId(prefill.id);
              setPendingPrefillLocation(prefill.location ?? null);
              setPendingPrefillService(prefill.service ?? null);
              setPendingPrefillDurationMin(prefill.durationMin ?? null);
              selectTab('karta');
            }}
            header={header}
          />
        </Suspense>
      </section>
    </>
  );
}

function PatientCardTabPanels({
  shellMeta,
  tabPromise,
  embeddedProgramContent,
  isAdmin = false,
  activeTab,
  visitedTabs,
  selectTab,
  pendingAppointmentId,
  pendingVisitDate,
  pendingPrefillLocation,
  pendingPrefillService,
  pendingPrefillDurationMin,
  onPendingConsumed,
  onCreateVisitFromAppointment,
  header,
}: TabPanelsProps) {
  const tab = use(tabPromise);
  const { identity } = header;
  const membershipsVisible = shellMeta.membershipsVisible;
  const membershipMutationsAllowed = shellMeta.membershipMutationAllowed;
  const specialistTasksAvailable = shellMeta.specialistTasksAvailable;
  const specialistTasksReadable = shellMeta.specialistTasksReadable;
  const [selectedVisitAppointmentId, setSelectedVisitAppointmentId] = useState<string | null>(null);
  const [rightPane, setRightPane] = useState<'overview' | 'membership'>('overview');
  const [mobilePane, setMobilePane] = useState<'master' | 'detail'>('master');
  const appointments = unwrapBootstrapEnvelope(tab.initialAppointments) ?? [];
  const appointmentOptions = appointments.map((item) => {
    const date = new Date(item.dateTime);
    const dateLabel = Number.isNaN(date.getTime())
      ? item.dateTime
      : date.toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    return {
      id: item.id,
      label: [dateLabel, item.serviceName, item.location].filter(Boolean).join(' · '),
    };
  });

  return (
    <>
      {visitedTabs.has('karta') ? (
        <div className={cn(activeTab !== 'karta' && 'hidden')}>
          <PatientTabKarta
            userId={identity.userId}
            header={header}
            pendingAppointmentId={pendingAppointmentId}
            pendingVisitDate={pendingVisitDate}
            pendingPrefillLocation={pendingPrefillLocation}
            pendingPrefillService={pendingPrefillService}
            pendingPrefillDurationMin={pendingPrefillDurationMin}
            onPendingConsumed={onPendingConsumed}
            initialClinicalState={unwrapBootstrapEnvelope(tab.initialClinicalState)}
            initialVisits={unwrapBootstrapEnvelope(tab.initialVisits)}
            initialAnamnesis={unwrapBootstrapEnvelope(tab.initialAnamnesis)}
            initialComorbidities={unwrapBootstrapEnvelope(tab.initialComorbidities)}
            composition={{
              leftContent: (
                <PatientTabRecords
                  userId={identity.userId}
                  header={header}
                  compositionMode="master"
                  onCreateVisitFromAppointment={(prefill) => {
                    setSelectedVisitAppointmentId(null);
                    setRightPane('overview');
                    setMobilePane('detail');
                    onCreateVisitFromAppointment(prefill);
                  }}
                  onOpenVisitNotes={(appointmentId) => {
                    setSelectedVisitAppointmentId(appointmentId);
                    setRightPane('overview');
                    setMobilePane('detail');
                  }}
                  onOpenMembershipConfiguration={() => {
                    setSelectedVisitAppointmentId(null);
                    setRightPane('membership');
                    setMobilePane('detail');
                  }}
                  initialAppointments={appointments}
                  initialPackages={unwrapBootstrapEnvelope(tab.initialPackages)}
                  membershipsVisible={membershipsVisible}
                  membershipMutationsAllowed={membershipMutationsAllowed}
                />
              ),
              rightContent:
                rightPane === 'membership' ? (
                  <section className={doctorSectionCardClass}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className={doctorSectionTitleClass}>Абонемент</h2>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRightPane('overview')}
                      >
                        Закрыть
                      </Button>
                    </div>
                    <DoctorClientMembershipsPanel
                      platformUserId={identity.userId}
                      appointments={appointmentOptions}
                      showCreateForm
                      showPackageList={false}
                      mutationsAllowed={membershipMutationsAllowed}
                      consumptionAllowed
                    />
                  </section>
                ) : (
                  <PatientTabOverview
                    active={activeTab === 'karta'}
                    userId={identity.userId}
                    header={header}
                    compositionMode="right-pane"
                    onTabSwitch={(tabId) => {
                      if (tabId === 'program') selectTab('program');
                    }}
                    initialClinicalState={tab.initialClinicalState}
                    initialVisits={tab.initialVisits}
                    initialNotes={tab.initialNotes}
                    initialTasks={tab.initialTasks}
                    initialProgramActivity={tab.initialProgramActivity}
                    initialAppointments={tab.initialAppointments}
                    initialPackages={tab.initialPackages}
                    initialProgramInstances={tab.initialProgramInstances}
                    initialProgramInstanceDetail={tab.initialProgramInstanceDetail}
                    initialExerciseCalendarSnapshot={tab.initialExerciseCalendarSnapshot}
                    initialMessagesSnapshot={tab.initialMessagesSnapshot}
                    membershipsVisible={membershipsVisible}
                    initialSupportEffectivePolicy={tab.initialSupportEffectivePolicy}
                    specialistTasksAvailable={specialistTasksAvailable}
                    specialistTasksReadable={specialistTasksReadable}
                  />
                ),
              selectedAppointmentId: selectedVisitAppointmentId,
              onCloseSelectedVisit: () => setSelectedVisitAppointmentId(null),
              mobilePane,
              onMobilePaneChange: setMobilePane,
            }}
          />
        </div>
      ) : null}
      {visitedTabs.has('program') ? (
        <div className={cn(activeTab !== 'program' && 'hidden')}>
          {embeddedProgramContent ?? (
            <PatientTabProgram
              userId={identity.userId}
              header={header}
              active={activeTab === 'program'}
              initialProgramInstances={unwrapBootstrapEnvelope(tab.initialProgramInstances)}
            />
          )}
        </div>
      ) : null}
      {visitedTabs.has('files') ? (
        <div className={cn(activeTab !== 'files' && 'hidden')}>
          <PatientTabFiles
            userId={identity.userId}
            header={header}
            initialFiles={unwrapBootstrapEnvelope(tab.initialFiles) ?? undefined}
          />
        </div>
      ) : null}
      {visitedTabs.has('account') ? (
        <div className={cn(activeTab !== 'account' && 'hidden')}>
          <PatientTabAccount
            userId={identity.userId}
            header={header}
            active={activeTab === 'account'}
            initialSupplementaryContacts={unwrapBootstrapEnvelope(tab.initialSupplementaryContacts)}
            isAdmin={isAdmin}
          />
        </div>
      ) : null}
    </>
  );
}
