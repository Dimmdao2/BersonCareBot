/**
 * Карточка клиента: контакты, записи, дневники, коммуникации.
 * Единый контейнер (`article`) со sticky-шапкой и плоскими секциями.
 */
"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { DoctorChatPanel } from "@/modules/messaging/components/DoctorChatPanel";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";
import { cn } from "@/lib/utils";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { LfkComplexExerciseLine } from "@/modules/diaries/types";
import type {
  PendingProgramTestEvaluationRow,
  TreatmentProgramInstanceSummary,
} from "@/modules/treatment-program/types";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { DoctorLfkComplexExerciseOverridesPanel } from "./DoctorLfkComplexExerciseOverridesPanel";
import { PatientTreatmentProgramsPanel } from "./PatientTreatmentProgramsPanel";
import { AdminDangerActions } from "./AdminDangerActions";
import { AdminClientAuditHistorySection } from "./AdminClientAuditHistorySection";
import { AdminClientProfileEditPanel } from "./AdminClientProfileEditPanel";
import { AdminMergeAccountsPanel } from "./AdminMergeAccountsPanel";
import { DoctorClientLifecycleActions } from "./DoctorClientLifecycleActions";
import { DoctorNotesPanel } from "./DoctorNotesPanel";
import { groupPendingProgramTestEvaluations } from "./groupPendingProgramTestEvaluations";
import { SubscriberBlockPanel } from "./SubscriberBlockPanel";

type ClientProfileCardProps = {
  profile: ClientProfile;
  messageHistory: MessageLogEntry[];
  userId: string;
  listBasePath?: string;
  /** Query `scope` карточки клиента (для ссылок на экземпляр программы). */
  profileListScope?: string;
  isAdmin?: boolean;
  canPermanentDelete?: boolean;
  canEditClientProfile?: boolean;
  publishedTreatmentProgramTemplates?: { id: string; title: string }[];
  assignTreatmentProgramEnabled?: boolean;
  /** A4: тесты программ без `decided_by` у активных экземпляров пациента. */
  pendingProgramTestEvaluations?: PendingProgramTestEvaluationRow[];
  /** Список экземпляров программ с RSC — без задержки на клиентском GET. */
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  /** B7: строки упражнений по комплексам (read с сервера). */
  lfkExerciseLinesByComplexId?: Record<string, LfkComplexExerciseLine[]>;
};

function SectionGroupTitle({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <p
      className={cn(
        "px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground",
        first ? "pt-3" : "border-t border-border pt-4",
      )}
    >
      {children}
    </p>
  );
}

/** Состояние UI сбрасывается при смене клиента (`key` на внутреннем компоненте). */
export function ClientProfileCard(props: ClientProfileCardProps) {
  return <ClientProfileCardInner key={props.userId} {...props} />;
}

function ClientProfileCardInner({
  profile,
  messageHistory,
  userId,
  listBasePath = "/app/doctor/clients",
  profileListScope,
  isAdmin = false,
  canPermanentDelete = false,
  canEditClientProfile = false,
  publishedTreatmentProgramTemplates = [],
  assignTreatmentProgramEnabled = false,
  pendingProgramTestEvaluations = [],
  treatmentProgramInstancesInitial,
  lfkExerciseLinesByComplexId = {},
}: ClientProfileCardProps) {
  const scopeQs = profileListScope ? `?scope=${encodeURIComponent(profileListScope)}` : "";
  const [contactsEditing, setContactsEditing] = useState(false);
  const [adminDetailsOpen, setAdminDetailsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatInitialMessages, setChatInitialMessages] = useState<SerializedSupportMessage[] | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const {
    identity,
    channelCards,
    upcomingAppointments,
    appointmentHistory,
    appointmentStats,
    symptomTrackings,
    recentSymptomEntries,
    lfkComplexes,
    recentLfkSessions,
  } = profile;

  const tel = phoneToTelHref(identity.phone);
  const displayHeading =
    identity.displayName?.trim() !== "" ? identity.displayName.trim() : "Имя не указано";
  const sampleRecordId = appointmentHistory[0]?.id ?? null;
  const backLabel =
    listBasePath.includes("subscribers") || listBasePath.includes("scope=all")
      ? "К списку подписчиков"
      : listBasePath.includes("scope=archived")
        ? "К архиву"
        : "К списку клиентов";

  const firstUpcoming = upcomingAppointments[0];
  const showAdminDetails = isAdmin || canPermanentDelete;

  const loadPatientUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/doctor/messages/conversations/unread-by-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientUserId: userId }),
      });
      const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
      if (res.ok && data.ok && typeof data.unreadCount === "number") {
        setChatUnreadCount(data.unreadCount);
      }
    } catch {
      // Badge is auxiliary; chat opening remains available if count fetch fails.
    }
  }, [userId]);

  useEffect(() => {
    void loadPatientUnreadCount();
  }, [loadPatientUnreadCount]);

  const pendingProgramTestGroups = useMemo(
    () => groupPendingProgramTestEvaluations(pendingProgramTestEvaluations),
    [pendingProgramTestEvaluations],
  );

  const openPatientChat = async () => {
    setChatOpen(true);
    setChatLoading(true);
    setChatError(null);
    try {
      const res = await fetch("/api/doctor/messages/conversations/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientUserId: userId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        conversationId?: string;
        messages?: SerializedSupportMessage[];
        unreadFromUserCount?: number;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.conversationId) {
        if (data.error === "patient_not_found") {
          setChatError("Пациент не найден, чат открыть нельзя.");
        } else if (data.error === "conversation_ensure_failed") {
          setChatError("Не удалось открыть чат пациента. Попробуйте ещё раз.");
        } else {
          setChatError("Не удалось открыть чат пациента");
        }
        return;
      }
      setChatConversationId(data.conversationId);
      setChatInitialMessages(data.messages ?? []);
      setChatUnreadCount(data.unreadFromUserCount ?? 0);
    } catch {
      setChatError("Ошибка сети при открытии чата");
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div id={`doctor-client-profile-page-${userId}`} className="flex flex-col gap-3">
      {identity.isBlocked ? (
        <div
          id="doctor-client-blocked-banner"
          className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
          role="status"
        >
          Подписчик заблокирован для отправки сообщений в чат поддержки
          {identity.blockedReason ? `: ${identity.blockedReason}` : "."}
        </div>
      ) : null}

      <article
        id={`doctor-client-profile-card-${userId}`}
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
      >
        {/* Sticky header (desktop); на узкой ширине — колонка без sticky */}
        <header
          className={cn(
            "z-10 border-b border-border bg-card px-4 py-3",
            "md:sticky md:top-[var(--doctor-sticky-offset,0px)]",
          )}
        >
          <div className="flex flex-col gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] md:items-start md:gap-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p id="doctor-client-display-name" className="min-w-0 text-base font-semibold text-foreground">
                  {displayHeading}
                </p>
                {identity.isArchived ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    Архив
                  </span>
                ) : null}
                {identity.isBlocked ? (
                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                    Блок
                  </span>
                ) : null}
              </div>
              {tel ? (
                <p className="text-sm">
                  <a href={tel} className="font-medium text-primary underline">
                    {identity.phone}
                  </a>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Телефон не указан</p>
              )}
            </div>

            <div className="min-w-0 text-center md:px-2">
              {firstUpcoming ? (
                <div className="text-sm">
                  {firstUpcoming.scheduleProvenancePrefix ? (
                    <p className="mb-0.5 text-xs text-muted-foreground">{firstUpcoming.scheduleProvenancePrefix}</p>
                  ) : null}
                  {firstUpcoming.link && /^https?:\/\//i.test(firstUpcoming.link) ? (
                    <a href={firstUpcoming.link} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {firstUpcoming.label}
                    </a>
                  ) : (
                    <span>{firstUpcoming.label}</span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Нет ближайших записей</p>
              )}
            </div>

            <div className="flex flex-col gap-2 md:items-end">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  id="doctor-client-open-support-chat-button"
                  onClick={() => void openPatientChat()}
                >
                  Открыть чат
                  {chatUnreadCount > 0 ? (
                    <span className="ml-2 rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {chatUnreadCount}
                    </span>
                  ) : null}
                </Button>
                <Link
                  href="#doctor-client-section-notes"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
                >
                  Заметки
                </Link>
                <Link
                  href="#doctor-client-section-treatment-programs"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "shrink-0")}
                >
                  Программа
                </Link>
              </div>
            </div>
          </div>
        </header>

        <SectionGroupTitle first>Клиническая работа</SectionGroupTitle>

        <section id="doctor-client-section-notes" className="border-t border-border px-4 pb-4 pt-2">
          <DoctorNotesPanel userId={userId} />
        </section>

        <section id="doctor-client-section-treatment-programs" className="border-t border-border px-4 pb-4 pt-2">
          <PatientTreatmentProgramsPanel
            patientUserId={userId}
            templates={publishedTreatmentProgramTemplates}
            disabled={!assignTreatmentProgramEnabled}
            profileListScope={profileListScope}
            initialInstances={treatmentProgramInstancesInitial}
          />
        </section>

        <section id="doctor-client-section-pending-program-tests" className="border-t border-border px-4 pb-4 pt-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Тесты, ожидающие оценки</h3>
            {pendingProgramTestEvaluations.length > 0 ? (
              <Badge variant="secondary" className="text-xs">
                К проверке · {pendingProgramTestEvaluations.length}
              </Badge>
            ) : null}
          </div>
          {pendingProgramTestEvaluations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет тестов, ожидающих оценки.</p>
          ) : (
            <ul className="m-0 list-none space-y-2 p-0">
              {pendingProgramTestGroups.map((g) => (
                <li key={g.attemptId} className="rounded-lg border border-border bg-card p-3">
                  <p className="text-sm font-medium">
                    {g.instanceTitle} · {g.stageTitle}
                  </p>
                  <p className="text-xs text-muted-foreground">Без оценки: {g.results.length}</p>
                  <Link
                    href={`/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(g.instanceId)}${scopeQs}#doctor-program-instance-test-results`}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 inline-flex")}
                  >
                    Открыть
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="doctor-client-section-lfk" className="border-t border-border px-4 pb-4 pt-2">
          <div className="flex flex-col gap-4">
            {lfkComplexes.length === 0 ? (
              <p className="text-muted-foreground">Нет комплексов ЛФК.</p>
            ) : (
              <>
                <p>Комплексы: {lfkComplexes.map((c) => c.title).join(", ")}</p>
                {recentLfkSessions.length > 0 && (
                  <p>Последние занятия: {recentLfkSessions.length} записей</p>
                )}
              </>
            )}
            <DoctorLfkComplexExerciseOverridesPanel
              patientUserId={userId}
              complexes={lfkComplexes}
              linesByComplexId={lfkExerciseLinesByComplexId}
            />
          </div>
        </section>

        <section id="doctor-client-section-symptoms" className="border-t border-border px-4 pb-4 pt-2">
          {symptomTrackings.length === 0 ? (
            <p className="text-muted-foreground">Нет отслеживаемых симптомов.</p>
          ) : (
            <>
              <p>Симптомы: {symptomTrackings.map((t) => t.symptomTitle).join(", ")}</p>
              {recentSymptomEntries.length > 0 && (
                <p>Последние записи: {recentSymptomEntries.slice(0, 5).map((e) => `${e.value0_10}`).join(", ")}</p>
              )}
            </>
          )}
        </section>

        <SectionGroupTitle>Записи</SectionGroupTitle>

        <section id="doctor-client-section-appointments" className="border-t border-border px-4 pb-4 pt-2">
          <div className="flex flex-col gap-4">
            {upcomingAppointments.length === 0 ? (
              <p className="text-muted-foreground">Нет предстоящих записей.</p>
            ) : (
              <ul id="doctor-client-upcoming-appointments-list" className="m-0 list-none space-y-3 p-0">
                {upcomingAppointments.map((a) => (
                  <li
                    key={a.id}
                    id={`doctor-client-upcoming-appointment-${a.id}`}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    {a.scheduleProvenancePrefix ? (
                      <p className="mb-1 text-xs text-muted-foreground">{a.scheduleProvenancePrefix}</p>
                    ) : null}
                    {a.link && /^https?:\/\//i.test(a.link) ? (
                      <a href={a.link} target="_blank" rel="noopener noreferrer">
                        {a.label}
                      </a>
                    ) : (
                      a.label
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Статистика: всего {appointmentStats.total}, отмен за 30 дн.: {appointmentStats.cancellations30d}
            </p>
          </div>
        </section>

        <section id="doctor-client-section-appointment-history" className="border-t border-border px-4 pb-4 pt-2">
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
              Показать историю записей ({appointmentHistory.length})
            </summary>
            <div className="mt-3">
              {appointmentHistory.length === 0 ? (
                <p className="text-muted-foreground">Нет записей в projection.</p>
              ) : (
                <ul id="doctor-client-appointment-history-list" className="m-0 list-none space-y-3 p-0">
                  {appointmentHistory.map((row) => (
                    <li key={row.id} className="rounded-lg border border-border bg-card p-3">
                      {row.scheduleProvenancePrefix ? (
                        <p className="mb-1 text-xs text-muted-foreground">{row.scheduleProvenancePrefix}</p>
                      ) : null}
                      {row.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </section>

        {messageHistory.length > 0 ? (
          <>
            <SectionGroupTitle>Коммуникации</SectionGroupTitle>
            <section id="doctor-client-section-communications" className="border-t border-border px-4 pb-4 pt-2">
              <div className="flex flex-col gap-3">
                <div className="md:hidden">
                  <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => void openPatientChat()}>
                    Открыть чат
                    {chatUnreadCount > 0 ? (
                      <span className="ml-2 rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {chatUnreadCount}
                      </span>
                    ) : null}
                  </Button>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <h3 className="text-sm font-medium">Единый чат поддержки</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    История переписки и отправка сообщений открываются в едином чате.
                  </p>
                </div>
                <details className="group">
                  <summary className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                    Старый журнал отправок ({messageHistory.length})
                  </summary>
                  <ul id="doctor-client-message-history-list" className="m-0 mt-3 list-none space-y-3 p-0">
                    {messageHistory.map((entry) => (
                      <li
                        key={entry.id}
                        id={`doctor-client-message-history-item-${entry.id}`}
                        className="rounded-lg border border-border bg-card p-3"
                      >
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {new Date(entry.sentAt).toLocaleString("ru")} · {entry.category}
                          {entry.outcome === "sent" ? (
                            <span className="ml-1.5 text-green-600 dark:text-green-500">доставлено</span>
                          ) : entry.outcome === "failed" ? (
                            <span className="ml-1.5 text-destructive">ошибка</span>
                          ) : (
                            <span className="ml-1.5">{entry.outcome}</span>
                          )}
                        </span>
                        <p className="mt-1">
                          {entry.text.slice(0, 80)}
                          {entry.text.length > 80 ? "…" : ""}
                        </p>
                        {Object.keys(entry.channelBindingsUsed).length > 0 ? (
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground opacity-80">
                            Каналы: {Object.keys(entry.channelBindingsUsed).join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </section>
          </>
        ) : null}

        <SectionGroupTitle>Учётная запись</SectionGroupTitle>

        <section id="doctor-client-section-contacts" className="border-t border-border px-4 pb-4 pt-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">Контакты и каналы</p>
              {canEditClientProfile ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label={contactsEditing ? "Закончить правку" : "Править контакты и ФИО"}
                  aria-pressed={contactsEditing}
                  onClick={() => setContactsEditing((v) => !v)}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>

            {contactsEditing && canEditClientProfile ? (
              <AdminClientProfileEditPanel
                userId={userId}
                displayName={identity.displayName}
                firstName={identity.firstName}
                lastName={identity.lastName}
                email={identity.email}
                emailVerifiedAt={identity.emailVerifiedAt}
                phone={identity.phone}
                embedded
                onCancel={() => setContactsEditing(false)}
                onSaved={() => setContactsEditing(false)}
              />
            ) : null}

            {!contactsEditing && identity.phone ? (
              tel ? (
                <p>
                  Телефон:{" "}
                  <a href={tel} className="font-medium text-primary underline">
                    {identity.phone}
                  </a>
                </p>
              ) : (
                <p>Телефон: {identity.phone}</p>
              )
            ) : null}
            {!contactsEditing && !identity.phone ? <p>Телефон не указан</p> : null}
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Каналы</p>
            <ul id="doctor-client-channels-list" className="m-0 list-none p-0">
              {channelCards.map((ch) => (
                <li key={ch.code} id={`doctor-client-channel-item-${ch.code}`}>
                  {ch.isLinked && ch.openUrl ? (
                    <a href={ch.openUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                      {ch.title}
                    </a>
                  ) : (
                    <>
                      {ch.title}: {ch.isLinked ? "подключён" : "не подключён"}
                      {ch.isLinked && (ch.isEnabledForMessages ? ", сообщения вкл." : ", сообщения выкл.")}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="doctor-client-section-lifecycle" className="border-t border-border px-4 pb-4 pt-2">
          <DoctorClientLifecycleActions
            userId={userId}
            isArchived={identity.isArchived}
            listBasePath={listBasePath}
            isAdmin={isAdmin}
            canPermanentDelete={canPermanentDelete}
          />
        </section>

        <section id="doctor-client-section-subscriber" className="border-t border-border px-4 pb-4 pt-2">
          <SubscriberBlockPanel
            userId={userId}
            initiallyBlocked={identity.isBlocked}
            blockedReason={identity.blockedReason}
          />
        </section>

        {showAdminDetails ? (
          <details
            className="border-t border-border"
            onToggle={(e) => setAdminDetailsOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              Админ-операции
            </summary>
            <div className="flex flex-col gap-4 border-t border-border px-4 pb-4 pt-4">
              {isAdmin ? (
                <AdminDangerActions userId={userId} sampleIntegratorRecordId={sampleRecordId} />
              ) : null}
              {canPermanentDelete ? (
                <AdminMergeAccountsPanel
                  anchorUserId={userId}
                  enabled
                  suspendHeavyFetch={!adminDetailsOpen}
                />
              ) : null}
              {canPermanentDelete ? (
                <AdminClientAuditHistorySection
                  platformUserId={userId}
                  enabled
                  suspendLoad={!adminDetailsOpen}
                />
              ) : null}
            </div>
          </details>
        ) : null}
      </article>

      <p id="doctor-client-back-link-container" className="pt-1">
        <Link
          id="doctor-client-back-link"
          href={listBasePath}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          {backLabel}
        </Link>
      </p>

      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" showCloseButton={!chatLoading}>
          <DialogHeader>
            <DialogTitle>Чат с пациентом</DialogTitle>
            <DialogDescription>{displayHeading}</DialogDescription>
          </DialogHeader>
          {chatLoading ? <p className="text-sm text-muted-foreground">Открываем чат...</p> : null}
          {chatError ? <p className="text-sm text-destructive">{chatError}</p> : null}
          {!chatLoading && !chatError && chatConversationId ? (
            <DoctorChatPanel
              key={chatConversationId}
              conversationId={chatConversationId}
              initialMessages={chatInitialMessages ?? []}
              onReadStateChanged={() => setChatUnreadCount(0)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
