'use client';

/**
 * PatientCardClient — Wave 2: real header + 6-tab client-side navigation.
 * Tabs are rendered once and shown/hidden client-side (no server re-fetch per tab).
 *
 * Header: FIO display with inline edit. All other editing lives in the «Учётка» tab.
 */
import { useState, useEffect, type ReactNode } from 'react';
import type { PatientCardHeader, PatientAppointmentItem } from '@/modules/doctor-clients/ports';
import type { AnamnesisState, ClinicalState, Visit } from '@/modules/patient-clinical/ports';
import type { Comorbidity } from '@/modules/patient-comorbidities/ports';
import type { DoctorNoteRow } from '@/modules/doctor-notes/ports';
import type { SpecialistTaskRow } from '@/modules/specialist-tasks/types';
import type { ProactiveInsightRow } from '@/modules/doctor-proactive-insights/types';
import type { DoctorPatientProgramActivity } from '../loadDoctorPatientProgramActivity';
import type { TreatmentProgramInstanceSummary } from '@/modules/treatment-program/types';
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
  doctorSectionSubtitleClass,
} from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { MessageSquare, Send, Smartphone, Mail, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { DoctorDatePicker } from '@/shared/ui/doctor/DoctorDatePicker';
import { DoctorOpenChatButton } from '@/shared/ui/doctor/DoctorOpenChatButton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { formatDoctorFio } from '@/shared/lib/fio';
import { PatientTabOverview } from './tabs/PatientTabOverview';
import { PatientTabKarta } from './tabs/PatientTabKarta';
import { PatientTabProgram } from './tabs/PatientTabProgram';
import { PatientTabRecords } from './tabs/PatientTabRecords';
import { PatientTabFiles, type FileRecord } from './tabs/PatientTabFiles';
import { PatientTabAccount, type SupplementaryContact } from './tabs/PatientTabAccount';
import { PatientTabComms } from './tabs/PatientTabComms';
import { PatientTabFinances, type FinancesInitialData } from './tabs/PatientTabFinances';
import type { ApiPackage, PaymentItem, AppointmentPrefill } from './tabs/PatientTabRecords';
import type { PatientProgramInteractionPolicy } from '@/modules/doctor-clients/supportPolicy';
import type { PatientPortalStatus } from '@/modules/patient-invites/ports';
import { PatientPortalInviteControls } from './PatientPortalInviteControls';

type Props = {
  cardHeader: PatientCardHeader | null;
  initialTab?: string;
  createVisitFrom?: string;
  visitDate?: string;
  /** When set, renders this node in place of PatientTabProgram in the Программа tab. */
  embeddedProgramContent?: ReactNode;
  initialClinicalState?: ClinicalState | null;
  initialVisits?: Visit[] | null;
  initialNotes?: DoctorNoteRow[] | null;
  initialTasks?: SpecialistTaskRow[] | null;
  initialSignals?: ProactiveInsightRow[] | null;
  initialProgramActivity?: DoctorPatientProgramActivity | null;
  initialAppointments?: PatientAppointmentItem[] | null;
  initialProgramInstances?: TreatmentProgramInstanceSummary[] | null;
  /** SSR-provided files list (previewUrl will be null — presigning deferred to client). */
  initialFiles?: FileRecord[] | null;
  /** SSR-provided anamnesis for the Карта tab. */
  initialAnamnesis?: AnamnesisState | null;
  /** SSR-provided active comorbidities for the Карта tab. */
  initialComorbidities?: Comorbidity[] | null;
  /** SSR-provided payment timeline data for the Финансы tab. */
  initialFinancesData?: FinancesInitialData | null;
  /** SSR-provided supplementary contacts for the Учётка tab (SecondaryPhones). */
  initialSupplementaryContacts?: SupplementaryContact[] | null;
  /** SSR-provided patient packages for the Визиты tab (MembershipPanel) and Обзор tab. */
  initialPackages?: ApiPackage[] | null;
  /** Whether subscriptions are visible for the doctor's organization. */
  membershipsVisible?: boolean;
  /** Read-only subscriptions retain clinical history but hide every mutation control. */
  membershipMutationsAllowed?: boolean;
  /** SSR-provided payments summary for the Визиты tab (PaymentsPanel). */
  initialPaymentsSummary?: { payments: PaymentItem[]; totalPaidMinor: number } | null;
  /** SSR-provided effective support policy for the Обзор tab (DoctorClientSupportPanel). */
  initialSupportEffectivePolicy?: PatientProgramInteractionPolicy | null;
  initialPortalState?: {
    status: PatientPortalStatus;
    inviteId: string | null;
    expiresAt: string | null;
  };
  /** Whether the viewer is an admin — gates the «Администрирование» section in PatientTabAccount. */
  isAdmin?: boolean;
};

type TabId =
  | 'overview'
  | 'karta'
  | 'program'
  | 'records'
  | 'files'
  | 'account'
  | 'comms'
  | 'finances';

const PATIENT_TABS: Array<{ id: TabId; label: string; badge?: number }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'karta', label: 'Карточка' },
  { id: 'program', label: 'Программа' },
  { id: 'records', label: 'Визиты' },
  { id: 'files', label: 'Файлы' },
  { id: 'comms', label: 'Коммуникации' },
  { id: 'finances', label: 'Финансы' },
  { id: 'account', label: 'Учётка' },
];

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
  cardHeader,
  initialTab,
  createVisitFrom,
  visitDate,
  embeddedProgramContent,
  initialClinicalState,
  initialVisits,
  initialNotes,
  initialTasks,
  initialSignals,
  initialProgramActivity,
  initialAppointments,
  initialProgramInstances,
  initialFiles,
  initialAnamnesis,
  initialComorbidities,
  initialFinancesData,
  initialSupplementaryContacts,
  initialPackages,
  membershipsVisible = true,
  membershipMutationsAllowed = true,
  initialPaymentsSummary,
  initialSupportEffectivePolicy,
  initialPortalState = { status: 'not_activated', inviteId: null, expiresAt: null },
  isAdmin = false,
}: Props) {
  const header = cardHeader;
  const resolvedInitialTab: TabId =
    initialTab && PATIENT_TABS.some((t) => t.id === initialTab)
      ? (initialTab as TabId)
      : 'overview';
  const [activeTab, setActiveTab] = useState<TabId>(resolvedInitialTab);
  const [pendingAppointmentId, setPendingAppointmentId] = useState<string | null>(
    createVisitFrom ?? null,
  );
  const [pendingVisitDate, setPendingVisitDate] = useState<string | null>(visitDate ?? null);
  const [pendingPrefillLocation, setPendingPrefillLocation] = useState<string | null>(null);
  const [pendingPrefillService, setPendingPrefillService] = useState<string | null>(null);
  const [pendingPrefillDurationMin, setPendingPrefillDurationMin] = useState<number | null>(null);

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
    gender?: 'male' | 'female' | null;
  } | null>(null);
  // Draft input values
  const [fioLastName, setFioLastName] = useState('');
  const [fioFirstName, setFioFirstName] = useState('');
  const [fioPatronymic, setFioPatronymic] = useState('');
  const [fioBirthDate, setFioBirthDate] = useState('');
  const [fioGender, setFioGender] = useState<'male' | 'female' | ''>('');

  // Auto-switch to karta tab when opening with createVisitFrom URL param
  useEffect(() => {
    if (createVisitFrom) setActiveTab('karta');
  }, [createVisitFrom]);

  // Listen for cross-tab navigation events dispatched by child tabs (e.g. «Оформить визит» → Карта)
  useEffect(() => {
    function handleOpenTab(e: Event) {
      const tab = (e as CustomEvent<{ tab: string }>).detail?.tab as TabId | undefined;
      if (tab && PATIENT_TABS.some((t) => t.id === tab)) {
        setActiveTab(tab);
      }
    }
    window.addEventListener('patient:open-tab', handleOpenTab);
    return () => window.removeEventListener('patient:open-tab', handleOpenTab);
  }, []);

  if (!header) {
    return (
      <div className={doctorSectionCardClass}>
        <p className="text-sm text-muted-foreground">Пациент не найден.</p>
      </div>
    );
  }

  const { identity, support } = header;

  // Resolved FIO: local override wins over server data
  const resolvedFirstName = fioOverride ? fioOverride.firstName : identity.firstName;
  const resolvedLastName = fioOverride ? fioOverride.lastName : identity.lastName;
  const resolvedPatronymic = fioOverride ? fioOverride.patronymic : identity.patronymic;
  const resolvedBirthDate =
    fioOverride?.birthDate !== undefined ? fioOverride.birthDate : identity.birthDate;
  const resolvedGender = fioOverride?.gender !== undefined ? fioOverride.gender : identity.gender;
  const fioDisplay = formatDoctorFio(
    { lastName: resolvedLastName, firstName: resolvedFirstName, patronymic: resolvedPatronymic },
    identity.displayName || '—',
  );

  function openFioEdit() {
    setFioLastName(resolvedLastName ?? '');
    setFioFirstName(resolvedFirstName ?? '');
    setFioPatronymic(resolvedPatronymic ?? '');
    setFioBirthDate(resolvedBirthDate ?? '');
    setFioGender(resolvedGender ?? '');
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
          gender: fioGender || null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setFioError((json as { error?: string })?.error ?? 'Ошибка сохранения');
        return;
      }
      // Apply local override to avoid page reload
      setFioOverride({
        lastName: fioLastName.trim() || null,
        firstName: fioFirstName.trim() || null,
        patronymic: fioPatronymic.trim() || null,
        birthDate: fioBirthDate.trim() || null,
        gender: fioGender || null,
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
  // Чат доступен, если привязан канал ИЛИ уже есть переписка (история сообщений):
  // сообщение сохранится в любом случае, привязанному каналу уйдёт ещё и пуш.
  const hasChat = hasTelegram || hasMax || identity.hasConversation;

  return (
    <div className="flex flex-col gap-3">
      {/* ================================================================
          IDENTITY HEADER CARD — READ ONLY
          Displaying patient identity; all edits live in «Учётка» tab.
      ================================================================ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Main header body */}
        <div className="px-4 pt-3.5 pb-2.5 flex flex-wrap gap-3.5 items-start">
          {/* LEFT: identity */}
          <div className="flex-1 min-w-[280px] flex flex-col gap-0">
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
                <div className="grid grid-cols-2 gap-2">
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
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Пол
                    </label>
                    <Select
                      value={fioGender || '__none__'}
                      onValueChange={(v) =>
                        setFioGender(v === '__none__' ? '' : (v as 'male' | 'female'))
                      }
                    >
                      <SelectTrigger className="h-8 text-sm w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Не указан</SelectItem>
                        <SelectItem value="female">Женский</SelectItem>
                        <SelectItem value="male">Мужской</SelectItem>
                      </SelectContent>
                    </Select>
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
                  disabled={!hasChat}
                  className={cn(
                    'h-6 w-6 rounded-md border text-xs',
                    hasChat
                      ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                      : 'border-transparent bg-muted/30 text-muted-foreground/40',
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </DoctorOpenChatButton>
                <Button
                  variant="ghost"
                  size="icon"
                  title={hasTelegram ? 'Открыть коммуникации: Telegram' : 'Telegram не привязан'}
                  disabled={!hasTelegram}
                  onClick={() => setActiveTab('comms')}
                  className={cn(
                    'h-6 w-6 rounded-md border text-xs',
                    hasTelegram
                      ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                      : 'border-transparent bg-muted/30 text-muted-foreground/40',
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title={hasMax ? 'Открыть коммуникации: MAX' : 'MAX не привязан'}
                  disabled={!hasMax}
                  onClick={() => setActiveTab('comms')}
                  className={cn(
                    'h-6 w-6 rounded-md border text-xs',
                    hasMax
                      ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/15'
                      : 'border-transparent bg-muted/30 text-muted-foreground/40',
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                </Button>
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
              initialState={initialPortalState}
            />
          </div>
        </div>

        {/* ================================================================
            TAB STRIP (.ptabs equivalent)
            6 tabs: Обзор · Карта · Программа · Записи · Файлы · Учётка
            Client-side switching via useState (no server re-fetch)
        ================================================================ */}
        <div className="px-4 py-2 border-t border-border/60 bg-muted/20">
          <div className="flex gap-0.5 flex-wrap">
            {PATIENT_TABS.map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'h-auto gap-1 rounded-md px-3 py-1 text-sm font-medium',
                  activeTab === tab.id
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {tab.label}
                {tab.badge != null && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                      activeTab === tab.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {tab.badge}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================
          TAB PANELS — rendered once, hidden when not active.
      ================================================================ */}
      <div className={cn(activeTab !== 'overview' && 'hidden')}>
        <PatientTabOverview
          userId={identity.userId}
          header={header}
          onTabSwitch={(tab) => setActiveTab(tab as TabId)}
          initialClinicalState={initialClinicalState}
          initialVisits={initialVisits}
          initialNotes={initialNotes}
          initialTasks={initialTasks}
          initialSignals={initialSignals}
          initialProgramActivity={initialProgramActivity}
          initialAppointments={initialAppointments}
          initialPackages={initialPackages}
          membershipsVisible={membershipsVisible}
          initialSupportEffectivePolicy={initialSupportEffectivePolicy}
        />
      </div>
      <div className={cn(activeTab !== 'karta' && 'hidden')}>
        <PatientTabKarta
          userId={identity.userId}
          header={header}
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
          initialClinicalState={initialClinicalState}
          initialVisits={initialVisits}
          initialAnamnesis={initialAnamnesis}
          initialComorbidities={initialComorbidities}
        />
      </div>
      <div className={cn(activeTab !== 'program' && 'hidden')}>
        {embeddedProgramContent ?? (
          <PatientTabProgram
            userId={identity.userId}
            header={header}
            active={activeTab === 'program'}
            initialProgramInstances={initialProgramInstances}
          />
        )}
      </div>
      <div className={cn(activeTab !== 'records' && 'hidden')}>
        <PatientTabRecords
          userId={identity.userId}
          header={header}
          onCreateVisitFromAppointment={(prefill: AppointmentPrefill) => {
            setPendingAppointmentId(prefill.id);
            setPendingPrefillLocation(prefill.location ?? null);
            setPendingPrefillService(prefill.service ?? null);
            setPendingPrefillDurationMin(prefill.durationMin ?? null);
            setActiveTab('karta');
          }}
          initialAppointments={initialAppointments}
          initialPackages={initialPackages}
          membershipsVisible={membershipsVisible}
          initialPaymentsSummary={initialPaymentsSummary}
        />
      </div>
      <div className={cn(activeTab !== 'files' && 'hidden')}>
        <PatientTabFiles
          userId={identity.userId}
          header={header}
          initialFiles={initialFiles ?? undefined}
        />
      </div>
      <div className={cn(activeTab !== 'account' && 'hidden')}>
        <PatientTabAccount
          userId={identity.userId}
          header={header}
          active={activeTab === 'account'}
          initialSupplementaryContacts={initialSupplementaryContacts}
          isAdmin={isAdmin}
        />
      </div>
      <div className={cn(activeTab !== 'comms' && 'hidden')}>
        <PatientTabComms
          userId={identity.userId}
          initialProgramInstances={initialProgramInstances}
        />
      </div>
      <div className={cn(activeTab !== 'finances' && 'hidden')}>
        <PatientTabFinances
          userId={identity.userId}
          initialData={initialFinancesData}
          initialAppointments={initialAppointments}
          membershipsVisible={membershipsVisible}
          membershipMutationsAllowed={membershipMutationsAllowed}
        />
      </div>
    </div>
  );
}
