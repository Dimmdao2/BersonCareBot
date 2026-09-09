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
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { cn } from '@/lib/utils';
import { MessageCircle, Send, Mail, Phone, Copy, Video } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorOpenChatButton } from '@/shared/ui/doctor/DoctorOpenChatButton';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import { formatDoctorFio, formatDoctorFioShort } from '@/shared/lib/fio';
import type { DoctorPatientExerciseCalendarSnapshot } from '../loadDoctorPatientExerciseCalendar';
import type { DoctorPatientMessagesSnapshot } from '../loadDoctorPatientMessagesSnapshot';
import type {
  DoctorPatientCardShellMeta,
  DoctorPatientCardTabBootstrap,
} from '../loadDoctorPatientCardPageBootstrap';
import { unwrapBootstrapEnvelope } from '../doctorPatientCardBootstrapShared';
import type { FileRecord } from './tabs/PatientTabFiles';
import type { SupplementaryContact } from './tabs/PatientTabAccount';
import type { PatientPortalStatus } from '@/modules/patient-invites/ports';
import { PatientPortalInviteControls } from './PatientPortalInviteControls';
import toast from 'react-hot-toast';
import { DoctorShellMobileBottomTabsRegistration } from '@/shared/ui/doctor/shell/DoctorShellChromeContext';
import { DateTime } from 'luxon';
import {
  doctorClientDisplayNameClass,
  doctorClientPrimaryOutlineActionClass,
} from '@/app/app/doctor/clients/doctorClientCardChrome';
import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorClientMembershipsPanel } from '@/app/app/doctor/clients/DoctorClientMembershipsPanel';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import {
  PatientCardDesktopTabs,
  PatientCardMobileTabs,
  type PatientCardTabId,
} from './PatientCardSectionTabs';
import { getEffectivePatientCardTabs } from './patientCardTabRegistry';
import type { WorkspaceModuleEffective } from '@/modules/system-settings/doctorWorkspaceComposition';
import { PatientEncounterStartModal } from './PatientEncounterStartModal';
import { EncounterHistoryModal } from './tabs/karta/EncounterHistoryModal';
import { EncounterViewModal } from './tabs/karta/EncounterViewModal';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { useActiveCall } from '@/shared/ui/video/ActiveCallCoordinator';

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
      <DoctorPanelLoading className="min-h-24" />
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
  /** The same request-local effective map used by shell navigation and route guards. */
  workspaceModules?: WorkspaceModuleEffective;
  /** Server-resolved scheduling mutation capability for all specialist-mode entry points. */
  appointmentsManageOwn?: boolean;
};

type TabPanelsProps = Props & {
  activeTab: TabId;
  visitedTabs: ReadonlySet<TabId>;
  selectTab: (tab: TabId) => void;
  historyOpen: boolean;
  onHistoryClose: () => void;
  onStartEncounter: (appointmentId?: string) => void;
  header: NonNullable<DoctorPatientCardShellMeta['cardHeader']>;
};

type TabId = PatientCardTabId;

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

function publicMessengerHandle(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@/, '') ?? '';
  return /^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(normalized) ? normalized : null;
}

function telegramChatHref(identity: PatientCardHeader['identity']): string | null {
  const username = publicMessengerHandle(identity.telegramUsername);
  if (username) return `https://t.me/${username}`;
  const phone = identity.phone?.replace(/\D/g, '') ?? '';
  return phone ? `https://t.me/+${phone}` : null;
}

function maxChatHref(identity: PatientCardHeader['identity']): string | null {
  const username = publicMessengerHandle(identity.maxUsername);
  return username ? `https://max.ru/${username}` : null;
}

function openExternalMessenger(href: string): void {
  window.open(href, '_blank', 'noopener,noreferrer');
}

function PatientContactActions({
  identity,
  hasTelegram,
  hasMax,
  hasEmail,
  chatButtonHighlighted,
  chatUnreadCount,
  onChatUnreadChange,
  patientOnSupport,
  directChatEnabled,
  className,
}: {
  identity: PatientCardHeader['identity'];
  hasTelegram: boolean;
  hasMax: boolean;
  hasEmail: boolean;
  chatButtonHighlighted: boolean;
  chatUnreadCount: number;
  onChatUnreadChange: (count: number) => void;
  patientOnSupport: boolean;
  directChatEnabled: boolean;
  className?: string;
}) {
  const actionClass = 'h-[34px] w-[34px] rounded-md border text-xs md:h-6 md:w-6';
  const telegramHref = hasTelegram ? telegramChatHref(identity) : null;
  const maxHref = hasMax ? maxChatHref(identity) : null;

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

      {directChatEnabled ? (
        <DoctorOpenChatButton
          patientUserId={identity.userId}
          patientName={identity.displayName ?? undefined}
          patientOnSupport={patientOnSupport}
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
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title={telegramHref ? 'Открыть чат в Telegram' : 'Ссылка Telegram недоступна'}
        disabled={!telegramHref}
        onClick={() => {
          if (telegramHref) openExternalMessenger(telegramHref);
        }}
        className={cn(
          actionClass,
          telegramHref
            ? doctorClientPrimaryOutlineActionClass
            : 'border-transparent bg-muted/30 text-muted-foreground/40',
        )}
      >
        <Send className="h-3.5 w-3.5" />
      </Button>
      {hasMax ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={maxHref ? 'Открыть чат в MAX' : 'Ссылка MAX недоступна'}
          disabled={!maxHref}
          onClick={() => {
            if (maxHref) openExternalMessenger(maxHref);
          }}
          className={cn(
            actionClass,
            maxHref
              ? doctorClientPrimaryOutlineActionClass
              : 'border-transparent bg-muted/30 text-muted-foreground/40',
            'font-semibold',
          )}
        >
          M
        </Button>
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
  workspaceModules,
  appointmentsManageOwn = true,
}: Props) {
  const { activeCall } = useActiveCall();
  const { patientPluralLabel, patientSingularLabel, supportGroupLabel } = useDoctorPatientTerms();
  const header = shellMeta.cardHeader;
  const availableTabs = useMemo(
    () => getEffectivePatientCardTabs(workspaceModules),
    [workspaceModules],
  );
  const availableTabIds = useMemo(
    () => new Set(availableTabs.map((tab) => tab.id)),
    [availableTabs],
  );
  const resolvedInitialTab: TabId =
    initialTab && availableTabIds.has(initialTab as TabId) ? (initialTab as TabId) : 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<TabId>>(
    () => new Set<TabId>([resolvedInitialTab]),
  );
  const [encounterHistoryOpen, setEncounterHistoryOpen] = useState(false);
  const [encounterStartOpen, setEncounterStartOpen] = useState(
    Boolean(createVisitFrom) && (workspaceModules?.encounters ?? true),
  );
  const [encounterStartAppointmentId, setEncounterStartAppointmentId] = useState<string | null>(
    createVisitFrom ?? null,
  );
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const selectTab = useCallback(
    (tab: TabId) => {
      if (!availableTabIds.has(tab)) return;
      setActiveTab(tab);
      setVisitedTabs((prev) => {
        if (prev.has(tab)) return prev;
        const next = new Set(prev);
        next.add(tab);
        return next;
      });
    },
    [availableTabIds],
  );

  const openEncounterStart = useCallback(
    (appointmentId?: string) => {
      if (workspaceModules?.encounters === false) return;
      setEncounterStartAppointmentId(appointmentId ?? null);
      setEncounterStartOpen(true);
    },
    [workspaceModules?.encounters],
  );

  // A trusted appointment coming from Today/calendar opens the same common start flow.
  useEffect(() => {
    if (createVisitFrom) openEncounterStart(createVisitFrom);
  }, [createVisitFrom, openEncounterStart]);

  // Listen for cross-tab navigation events dispatched by child tabs (e.g. «Оформить визит» → Карта)
  useEffect(() => {
    function handleOpenTab(e: Event) {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab as TabId | undefined;
      if (tab && availableTabIds.has(tab)) {
        selectTab(tab);
      }
    }
    window.addEventListener('patient:open-tab', handleOpenTab);
    return () => window.removeEventListener('patient:open-tab', handleOpenTab);
  }, [availableTabIds, selectTab]);

  useEffect(() => {
    const patientUserId = header?.identity.userId;
    if (!patientUserId || workspaceModules?.direct_chat === false) {
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
        if (!cancelled && response.ok && payload.ok && typeof payload.unreadCount === 'number') {
          setChatUnreadCount(payload.unreadCount);
        }
      })
      .catch(() => {
        // The badge is optional; chat remains available when the count cannot be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [header?.identity.userId, workspaceModules?.direct_chat]);

  const mobileBottomTabs = useMemo(
    () =>
      header ? (
        <PatientCardMobileTabs
          activeTab={activeTab}
          onTabChange={selectTab}
          workspaceModules={workspaceModules}
        />
      ) : null,
    [activeTab, header, selectTab, workspaceModules],
  );

  if (!header) {
    return (
      <DoctorAppShell title={`Карточка ${patientSingularLabel.toLocaleLowerCase('ru-RU')}`} backHref={patientListHref} mobileBottomGutter>
        <DoctorPageHeader
          id="doctor-patient-card-header"
          title={`Карточка ${patientSingularLabel.toLocaleLowerCase('ru-RU')}`}
          tabs={
            <Link
              href={patientListHref}
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                'h-8 rounded-[var(--doctor-control-radius,24px)] px-3',
              )}
            >
              К {patientPluralLabel.toLocaleLowerCase('ru-RU')}
            </Link>
          }
        />
        <section className={doctorPageStackClass}>
          <div className={doctorSectionCardClass}>
            <p className="text-sm text-muted-foreground">{patientSingularLabel} не найден.</p>
          </div>
        </section>
      </DoctorAppShell>
    );
  }

  // FILES-09: the Files tab is the only panel whose own list must own scrolling while the rest
  // of the card stays fixed between the header/tabs and the bottom panels. Reusing the existing
  // `DoctorAppShell` full-height contract (already used for Пациенты/Коммуникации/Заявки) only
  // while this specific tab is active keeps every other patient-card tab's current page-scroll
  // behaviour byte-for-byte unchanged.
  const isFilesTabActive = activeTab === 'files';

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
    <DoctorAppShell
      title={`Карточка ${patientSingularLabel.toLocaleLowerCase('ru-RU')}`}
      backHref={patientListHref}
      mobileBottomGutter={!isFilesTabActive}
      layout={isFilesTabActive ? 'full-height' : 'default'}
    >
      <DoctorShellMobileBottomTabsRegistration content={mobileBottomTabs} />
      <DoctorPageHeader
        id="doctor-patient-card-header"
        title={`Карточка ${patientSingularLabel.toLocaleLowerCase('ru-RU')}`}
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
              К {patientPluralLabel.toLocaleLowerCase('ru-RU')}
            </Link>
            <PatientCardDesktopTabs
              activeTab={activeTab}
              onTabChange={selectTab}
              workspaceModules={workspaceModules}
            />
          </div>
        }
      />
      <section
        className={cn(
          doctorPageStackClass,
          'flex flex-col gap-3 pt-3 pb-3 md:pt-0 md:pb-0',
          isFilesTabActive && 'min-h-0 flex-1 overflow-hidden',
        )}
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
              <div
                className={cn(doctorMetaTextClass, 'mt-2.5 flex flex-wrap items-center gap-1.5')}
              >
                <span>
                  Дата рождения: {resolvedBirthDate ? fmtBirthDate(resolvedBirthDate) : '—'}
                </span>
              </div>

              {support.isOnSupport ? (
                <div className="mt-2">
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <span>
                      ★ {supportGroupLabel} с{' '}
                      {supportStartedAt ? formatSupportStartedAt(supportStartedAt) : '—'}
                    </span>
                    {supportDuration ? (
                      <span className="font-normal text-primary/70">{supportDuration}</span>
                    ) : null}
                  </span>
                </div>
              ) : null}

              {workspaceModules?.client_portal !== false ? (
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
              ) : null}

              {workspaceModules?.encounters !== false || workspaceModules?.video_meetings ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {workspaceModules?.encounters !== false ? (
                    <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEncounterHistoryOpen(true)}
                  >
                    История приёмов
                  </Button>
                  <Button type="button" size="sm" onClick={() => openEncounterStart()}>
                    Начать приём
                  </Button>
                    </>
                  ) : null}
                  {workspaceModules?.video_meetings ? (
                    <Link
                      className={buttonVariants({ size: 'sm', className: 'size-9 p-0' })}
                      href={activeCall?.returnUrl ?? `/app/doctor/patients/${encodeURIComponent(identity.userId)}/live`}
                      title={activeCall ? 'Вернуться к звонку' : 'Начать видеозвонок'}
                      aria-label={activeCall ? 'Вернуться к звонку' : 'Начать видеозвонок'}
                    >
                      <Video className="size-4" />
                    </Link>
                  ) : null}
                </div>
              ) : null}
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
              patientOnSupport={support.isOnSupport}
              directChatEnabled={workspaceModules?.direct_chat !== false}
            />
          </div>
        ) : null}

        {/* TAB PANELS — mount on first visit; tab data streams in via Suspense.
            FILES-09: while the Files tab is active, this wrapper fills the remaining flex
            space (`<section>` above is bounded by the full-height shell) so only the Files
            tab's own file list scrolls; every other tab renders through the same plain
            wrapper as before (no classes) and keeps its current page-scroll behaviour. */}
        <Suspense fallback={<PatientTabPanelLoading />}>
          <div className={cn(isFilesTabActive && 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
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
              historyOpen={encounterHistoryOpen}
              onHistoryClose={() => setEncounterHistoryOpen(false)}
              onStartEncounter={openEncounterStart}
              header={header}
              workspaceModules={workspaceModules}
              appointmentsManageOwn={appointmentsManageOwn}
            />
          </div>
        </Suspense>
      </section>
      {encounterStartOpen && workspaceModules?.encounters !== false ? (
        <PatientEncounterStartModal
          open
          userId={identity.userId}
          header={header}
          displayIana={shellMeta.displayIana ?? 'Europe/Moscow'}
          todayIso={
            shellMeta.todayIso ??
            DateTime.now()
              .setZone(shellMeta.displayIana ?? 'Europe/Moscow')
              .toISODate() ??
            ''
          }
          initialAppointmentId={encounterStartAppointmentId}
          appointmentsManageOwn={appointmentsManageOwn}
          videoMeetingsEnabled={workspaceModules?.video_meetings ?? false}
          onClose={() => setEncounterStartOpen(false)}
        />
      ) : null}
    </DoctorAppShell>
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
  historyOpen,
  onHistoryClose,
  onStartEncounter,
  header,
  workspaceModules,
  appointmentsManageOwn = true,
}: TabPanelsProps) {
  const tab = use(tabPromise);
  const availableTabIds = new Set(
    getEffectivePatientCardTabs(workspaceModules).map((availableTab) => availableTab.id),
  );
  const { identity } = header;
  const membershipsVisible = shellMeta.membershipsVisible;
  const membershipMutationsAllowed = shellMeta.membershipMutationAllowed;
  const specialistTasksAvailable = shellMeta.specialistTasksAvailable;
  const specialistTasksReadable = shellMeta.specialistTasksReadable;
  const [selectedVisitAppointmentId, setSelectedVisitAppointmentId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<'master' | 'detail'>('master');
  const [membershipConfigurationOpen, setMembershipConfigurationOpen] = useState(false);
  const [historyVisitId, setHistoryVisitId] = useState<string | null>(null);
  const appointments = unwrapBootstrapEnvelope(tab.initialAppointments) ?? [];
  const packages = unwrapBootstrapEnvelope(tab.initialPackages) ?? [];
  const visits = unwrapBootstrapEnvelope(tab.initialVisits) ?? [];

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
              onStartEncounter(prefill.id);
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
            displayIana={shellMeta.displayIana}
            encountersEnabled={workspaceModules?.encounters !== false}
            appointmentsManageOwn={appointmentsManageOwn}
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
            canOpenKarta={availableTabIds.has('karta')}
            canOpenProgram={availableTabIds.has('program')}
            canCreateEncounter={workspaceModules?.encounters !== false}
            medicalRecordEnabled={workspaceModules?.medical_record !== false}
            encountersEnabled={workspaceModules?.encounters !== false}
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
            initialClinicalState={unwrapBootstrapEnvelope(tab.initialClinicalState)}
            initialVisits={unwrapBootstrapEnvelope(tab.initialVisits)}
            initialAnamnesis={unwrapBootstrapEnvelope(tab.initialAnamnesis)}
            initialComorbidities={unwrapBootstrapEnvelope(tab.initialComorbidities)}
            medicalRecordEnabled={workspaceModules?.medical_record !== false}
            encountersEnabled={workspaceModules?.encounters !== false}
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
              programCommentsEnabled={workspaceModules?.program_comments !== false}
            />
          )}
        </div>
      ) : null}
      {visitedTabs.has('files') ? (
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-hidden',
            activeTab !== 'files' && 'hidden',
          )}
        >
          <PatientTabFiles
            userId={identity.userId}
            header={header}
            initialFiles={unwrapBootstrapEnvelope(tab.initialFiles) ?? undefined}
            encountersEnabled={workspaceModules?.encounters !== false}
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
      {workspaceModules?.encounters !== false ? (
        <>
          <EncounterHistoryModal
            open={historyOpen}
            onClose={onHistoryClose}
            visits={visits}
            patientName={formatDoctorFioShort(identity, identity.displayName)}
            patientOnSupport={header.support.isOnSupport}
            onOpenVisit={setHistoryVisitId}
          />
          <EncounterViewModal
            visit={
              historyVisitId ? (visits.find((visit) => visit.id === historyVisitId) ?? null) : null
            }
            nested={historyOpen}
            editHref={
              historyVisitId
                ? `/app/doctor/patients/${identity.userId}/visits/${historyVisitId}`
                : ''
            }
            patientName={formatDoctorFioShort(identity, identity.displayName)}
            patientOnSupport={header.support.isOnSupport}
            onClose={() => setHistoryVisitId(null)}
          />
        </>
      ) : null}
      <DoctorModal
        open={membershipConfigurationOpen}
        onClose={() => setMembershipConfigurationOpen(false)}
        title={
          <DoctorModalStackedTitle
            label="Добавить абонемент"
            patientName={formatDoctorFioShort(identity, identity.displayName)}
            patientOnSupport={header.support.isOnSupport === true}
            patientVariant="context"
          />
        }
        size="lg"
        desktopPresentation="right-sheet"
      >
        <DoctorClientMembershipsPanel
          platformUserId={identity.userId}
          showCreateForm
          showPackageList={false}
          mutationsAllowed={membershipMutationsAllowed}
          consumptionAllowed
          onCreated={() => setMembershipConfigurationOpen(false)}
        />
      </DoctorModal>
    </>
  );
}
