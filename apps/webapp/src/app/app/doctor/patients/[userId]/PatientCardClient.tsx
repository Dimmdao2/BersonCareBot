'use client';

/**
 * PatientCardClient — organization card with five product tabs.
 * Tabs are rendered once and shown/hidden client-side (no server re-fetch per tab).
 *
 * Header: FIO display with inline edit. All other editing lives in the «Учётка» tab.
 */
import { useState, useEffect, useCallback, useMemo, Suspense, use, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { PatientCardHeader } from '@/modules/doctor-clients/ports';
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
  doctorMetaTextClass,
  doctorSectionCardClass,
  doctorPageStackClass,
} from '@/shared/ui/doctor/doctorVisual';
import { doctorSectionTabClass } from '@/shared/ui/doctor/DoctorSectionTabs';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { cn } from '@/lib/utils';
import { MessageCircle, Send, Mail, Phone, Copy } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorOpenChatButton } from '@/shared/ui/doctor/DoctorOpenChatButton';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
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
import toast from 'react-hot-toast';
import { DoctorMobileSectionTabs } from '@/shared/ui/doctor/shell/DoctorMobileSectionTabs';
import { DoctorShellMobileBottomTabsRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { DateTime } from 'luxon';
import {
  doctorClientDisplayNameClass,
  doctorClientPrimaryOutlineActionClass,
} from '@/app/app/doctor/clients/doctorClientCardChrome';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { DoctorClientMembershipsPanel } from '@/app/app/doctor/clients/DoctorClientMembershipsPanel';

function formatSupportStartedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  });
}

function formatSupportDuration(value: string, now = new Date()): string | null {
  const zone = 'Europe/Moscow';
  const startedAt = DateTime.fromISO(value, { setZone: true }).setZone(zone).startOf('day');
  const today = DateTime.fromJSDate(now).setZone(zone).startOf('day');
  if (!startedAt.isValid || startedAt > today) return null;

  let months = Math.max(0, Math.floor(today.diff(startedAt, 'months').months));
  let monthAnchor = startedAt.plus({ months });
  if (monthAnchor > today) {
    months -= 1;
    monthAnchor = startedAt.plus({ months });
  }
  const days = Math.max(0, Math.floor(today.diff(monthAnchor, 'days').days));
  const dayLabel =
    days % 10 === 1 && days % 100 !== 11
      ? 'день'
      : days % 10 >= 2 && days % 10 <= 4 && (days % 100 < 12 || days % 100 > 14)
        ? 'дня'
        : 'дней';

  return `${months} мес. ${days} ${dayLabel}`;
}

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
  newVisitRequestId: number;
  header: NonNullable<DoctorPatientCardShellMeta['cardHeader']>;
};

type TabId = 'overview' | 'karta' | 'program' | 'files' | 'account';

const PATIENT_TABS: Array<{ id: TabId; label: string; badge?: number }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'karta', label: 'Карта' },
  { id: 'program', label: 'ЛФК' },
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
      className="hidden gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
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


function phoneHref(phone: string): string {
  const normalized = phone.replace(/[^\d+]/g, '');
  return `tel:${normalized || phone}`;
}

function PatientContactActions({
  identity,
  hasTelegram,
  hasMax,
  hasEmail,
  chatButtonHighlighted,
  chatUnreadCount,
  onChatUnreadChange,
  className,
}: {
  identity: PatientCardHeader['identity'];
  hasTelegram: boolean;
  hasMax: boolean;
  hasEmail: boolean;
  chatButtonHighlighted: boolean;
  chatUnreadCount: number;
  onChatUnreadChange: (count: number) => void;
  className?: string;
}) {
  const actionClass = 'h-[34px] w-[34px] rounded-md border text-xs md:h-6 md:w-6';

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          title={identity.phone ? 'Действия с телефоном' : 'Телефон не указан'}
          disabled={!identity.phone}
          className={cn(
            buttonVariants({ variant: 'ghost' }),
            doctorClientPrimaryOutlineActionClass,
            'h-[34px] gap-1.5 px-2 font-mono text-xs md:h-6',
          )}
        >
          <Phone className="h-3.5 w-3.5" />
          <span>{identity.phone ?? '—'}</span>
        </DropdownMenuTrigger>
        {identity.phone ? (
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard.writeText(identity.phone!).then(
                  () => toast.success('Телефон скопирован'),
                  () => toast.error('Не удалось скопировать телефон'),
                );
              }}
            >
              <Copy className="h-4 w-4" />
              Скопировать
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(phoneHref(identity.phone!), '_self')}>
              <Phone className="h-4 w-4" />
              Позвонить
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>

      <DoctorOpenChatButton
        patientUserId={identity.userId}
        patientName={identity.displayName ?? undefined}
        variant="ghost"
        size="icon"
        title={chatUnreadCount > 0 ? `Открыть чат · ${chatUnreadCount}` : 'Открыть чат'}
        onUnreadChange={onChatUnreadChange}
        className={cn(
          actionClass,
          chatUnreadCount > 0
            ? 'border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 hover:text-destructive'
            : chatButtonHighlighted
              ? doctorClientPrimaryOutlineActionClass
              : 'border-transparent bg-muted/30 text-muted-foreground/40 hover:bg-primary/15 hover:text-primary',
        )}
      >
        <span className="relative inline-flex">
          <MessageCircle className="h-3.5 w-3.5" />
          <DoctorAttentionBadge count={chatUnreadCount} dot />
        </span>
      </DoctorOpenChatButton>
      <DoctorOpenChatButton
        patientUserId={identity.userId}
        patientName={identity.displayName ?? undefined}
        variant="ghost"
        size="icon"
        title={hasTelegram ? 'Открыть коммуникации: Telegram' : 'Telegram не привязан'}
        disabled={!hasTelegram}
        className={cn(
          actionClass,
          hasTelegram
            ? doctorClientPrimaryOutlineActionClass
            : 'border-transparent bg-muted/30 text-muted-foreground/40',
        )}
      >
        <Send className="h-3.5 w-3.5" />
      </DoctorOpenChatButton>
      {hasMax ? (
        <DoctorOpenChatButton
          patientUserId={identity.userId}
          patientName={identity.displayName ?? undefined}
          variant="ghost"
          size="icon"
          title="Открыть коммуникации: MAX"
          className={cn(
            actionClass,
            doctorClientPrimaryOutlineActionClass,
            'font-semibold',
          )}
        >
          M
        </DoctorOpenChatButton>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        title="Написать email"
        disabled={!hasEmail}
        onClick={() => {
          if (identity.email) window.open(`mailto:${identity.email}`, '_self');
        }}
        className={cn(
          actionClass,
          hasEmail
            ? doctorClientPrimaryOutlineActionClass
            : 'border-transparent bg-muted/30 text-muted-foreground/40',
        )}
      >
        <Mail className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
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
    initialTab && PATIENT_TABS.some((t) => t.id === initialTab)
      ? (initialTab as TabId)
      : 'overview';
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
  const [newVisitRequestId, setNewVisitRequestId] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const selectTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, []);

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

  useEffect(() => {
    const patientUserId = header?.identity.userId;
    if (!patientUserId) {
      setChatUnreadCount(0);
      return;
    }

    let cancelled = false;
    void fetch('/api/doctor/messages/conversations/unread-by-patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientUserId }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { ok?: boolean; unreadCount?: number };
        if (
          !cancelled &&
          response.ok &&
          payload.ok &&
          typeof payload.unreadCount === 'number'
        ) {
          setChatUnreadCount(payload.unreadCount);
        }
      })
      .catch(() => {
        // The badge is optional; chat remains available when the count cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [header?.identity.userId]);

  const mobileBottomTabs = useMemo(
    () =>
      header ? (
        <DoctorMobileSectionTabs
          tabs={PATIENT_TABS}
          activeTab={activeTab}
          onTabChange={selectTab}
          ariaLabel="Разделы карточки пациента"
        />
      ) : null,
    [activeTab, header, selectTab],
  );

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
  const supportStartedAt = support.startedAt ?? shellMeta.currentProgramStartedAt;
  const supportDuration = supportStartedAt ? formatSupportDuration(supportStartedAt) : null;

  // ФИО/дата рождения — редактируются только через стандартную модалку вкладки «Учётка»
  // (ACCOUNT-01/04): глобальная шапка карточки — read-only витрина identity.
  const resolvedBirthDate = identity.birthDate;
  const fioDisplay = formatDoctorFio(
    { lastName: identity.lastName, firstName: identity.firstName, patronymic: identity.patronymic },
    identity.displayName || '—',
  );

  const hasTelegram = Boolean(identity.bindings.telegramId);
  const hasMax = Boolean(identity.bindings.maxId);
  const hasEmail = Boolean(identity.email);
  const hasConversationSignal = Boolean(identity.hasConversation);
  const chatButtonHighlighted = hasTelegram || hasMax || hasConversationSignal;

  return (
    <>
      <DoctorShellMobileBottomTabsRegistration content={mobileBottomTabs} />
      <DoctorPageHeader
        id="doctor-patient-card-header"
        title="Карточка пациента"
        className="hidden md:flex"
        tabs={
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href={patientListHref}
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'hidden h-8 shrink-0 rounded-[var(--doctor-control-radius,24px)] px-3 md:inline-flex',
              )}
            >
              К клиентам
            </Link>
            <PatientCardTabsNav activeTab={activeTab} onTabClick={selectTab} />
          </div>
        }
      />
      <section
        className={cn(doctorPageStackClass, 'flex flex-col gap-3 pt-3 pb-3 md:pt-0 md:pb-0')}
      >
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
              {/* FIO (primary) — read-only; edits live in «Учётка» (ACCOUNT-01/04) */}
              <div className="flex items-start gap-2 flex-wrap">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span id="doctor-client-display-name" className={doctorClientDisplayNameClass}>
                      {fioDisplay}
                    </span>
                  </div>
                </div>
              </div>

              {/* Дата рождения — read-only; edit via pencil */}
              <div className={cn(doctorMetaTextClass, 'mt-2.5 flex flex-wrap items-center gap-1.5')}>
                <span>
                  Дата рождения: {resolvedBirthDate ? fmtBirthDate(resolvedBirthDate) : '—'}
                </span>
              </div>

              {support.isOnSupport ? (
                <div className="mt-2">
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span>
                      ★ На сопровождении с{' '}
                      {supportStartedAt ? formatSupportStartedAt(supportStartedAt) : '—'}
                    </span>
                    {supportDuration ? (
                      <span className="font-normal text-primary/70">{supportDuration}</span>
                    ) : null}
                  </span>
                </div>
              ) : null}

              <PatientPortalInviteControls
                patientUserId={identity.userId}
                initialState={
                  shellMeta.portalState ?? {
                    status: 'not_activated',
                    inviteId: null,
                    expiresAt: null,
                  }
                }
              />
            </div>
          </div>
        </div>

        {activeTab === 'overview' ? (
          <div className="rounded-xl border border-border bg-card px-4 py-2.5">
            <PatientContactActions
              identity={identity}
              hasTelegram={hasTelegram}
              hasMax={hasMax}
              hasEmail={hasEmail}
              chatButtonHighlighted={chatButtonHighlighted}
              chatUnreadCount={chatUnreadCount}
              onChatUnreadChange={setChatUnreadCount}
            />
          </div>
        ) : null}

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
            newVisitRequestId={newVisitRequestId}
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
  newVisitRequestId,
  header,
}: TabPanelsProps) {
  const tab = use(tabPromise);
  const { identity } = header;
  const membershipsVisible = shellMeta.membershipsVisible;
  const membershipMutationsAllowed = shellMeta.membershipMutationAllowed;
  const specialistTasksAvailable = shellMeta.specialistTasksAvailable;
  const specialistTasksReadable = shellMeta.specialistTasksReadable;
  const [selectedVisitAppointmentId, setSelectedVisitAppointmentId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'master' | 'detail'>('master');
  const [membershipConfigurationOpen, setMembershipConfigurationOpen] = useState(false);
  const appointments = unwrapBootstrapEnvelope(tab.initialAppointments) ?? [];
  const packages = unwrapBootstrapEnvelope(tab.initialPackages) ?? [];

  return (
    <>
      {visitedTabs.has('overview') ? (
        <div className={cn('flex flex-col gap-2.5', activeTab !== 'overview' && 'hidden')}>
          <PatientTabRecords
            userId={identity.userId}
            header={header}
            compositionMode="master"
            onCreateVisitFromAppointment={(prefill) => {
              setSelectedVisitAppointmentId(null);
              setMobilePane('detail');
              selectTab('karta');
              onCreateVisitFromAppointment(prefill);
            }}
            onOpenVisitNotes={(appointmentId) => {
              setSelectedVisitAppointmentId(appointmentId);
              setMobilePane('detail');
              selectTab('karta');
            }}
            onOpenMembershipConfiguration={() => setMembershipConfigurationOpen(true)}
            initialAppointments={appointments}
            initialPackages={packages}
            membershipsVisible={membershipsVisible}
            membershipMutationsAllowed={membershipMutationsAllowed}
          />
          <PatientTabOverview
            active={activeTab === 'overview'}
            userId={identity.userId}
            header={header}
            compositionMode="overview"
            onTabSwitch={(tabId) => {
              if (tabId === 'program') selectTab('program');
              if (tabId === 'karta') selectTab('karta');
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
            tasksDisplayIana={shellMeta.displayIana}
            tasksTodayIso={shellMeta.todayIso}
          />
        </div>
      ) : null}
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
            newVisitRequestId={newVisitRequestId}
            onPendingConsumed={onPendingConsumed}
            initialClinicalState={unwrapBootstrapEnvelope(tab.initialClinicalState)}
            initialVisits={unwrapBootstrapEnvelope(tab.initialVisits)}
            initialAnamnesis={unwrapBootstrapEnvelope(tab.initialAnamnesis)}
            initialComorbidities={unwrapBootstrapEnvelope(tab.initialComorbidities)}
            composition={{
              leftContent: null,
              rightContent: null,
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
      <DoctorModal
        open={membershipConfigurationOpen}
        onClose={() => setMembershipConfigurationOpen(false)}
        title="Добавить абонемент"
        size="lg"
        desktopPresentation="right-sheet"
      >
        <DoctorClientMembershipsPanel
          platformUserId={identity.userId}
          showCreateForm
          showPackageList={false}
          mutationsAllowed={membershipMutationsAllowed}
          consumptionAllowed
        />
      </DoctorModal>
    </>
  );
}
