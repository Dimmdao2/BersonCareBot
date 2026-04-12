/**
 * Карточка клиента: контакты, записи, дневники, коммуникации.
 * `/app/doctor/clients/[userId]` — один раскрытый блок (аккордеон).
 */
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { cn } from "@/lib/utils";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { PrepareDraftResult } from "@/modules/doctor-messaging/service";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { AssignLfkTemplatePanel } from "./AssignLfkTemplatePanel";
import { AdminDangerActions } from "./AdminDangerActions";
import { AdminClientAuditHistorySection } from "./AdminClientAuditHistorySection";
import { AdminClientProfileEditPanel } from "./AdminClientProfileEditPanel";
import { AdminMergeAccountsPanel } from "./AdminMergeAccountsPanel";
import { DoctorClientLifecycleActions } from "./DoctorClientLifecycleActions";
import { DoctorNotesPanel } from "./DoctorNotesPanel";
import { SendMessageForm } from "./[userId]/SendMessageForm";
import { SubscriberBlockPanel } from "./SubscriberBlockPanel";

type ClientProfileCardProps = {
  profile: ClientProfile;
  messageDraft: PrepareDraftResult | null;
  messageHistory: MessageLogEntry[];
  userId: string;
  listBasePath?: string;
  isAdmin?: boolean;
  canPermanentDelete?: boolean;
  canEditClientProfile?: boolean;
  publishedLfkTemplates?: { id: string; title: string }[];
  assignLfkEnabled?: boolean;
};

function AccItem({
  id,
  title,
  openSection,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  openSection: string | null;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  const isOpen = openSection === id;
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-base font-semibold tracking-tight",
          "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        id={`doctor-client-acc-trigger-${id}`}
      >
        {title}
        <ChevronDown
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
          aria-hidden
        />
      </button>
      {isOpen ? <div className="border-t border-border p-4">{children}</div> : null}
    </div>
  );
}

export function ClientProfileCard({
  profile,
  messageDraft,
  messageHistory,
  userId,
  listBasePath = "/app/doctor/clients",
  isAdmin = false,
  canPermanentDelete = false,
  canEditClientProfile = false,
  publishedLfkTemplates = [],
  assignLfkEnabled = false,
}: ClientProfileCardProps) {
  const [openSection, setOpenSection] = useState<string | null>("contacts");
  const toggle = (id: string) => setOpenSection((cur) => (cur === id ? null : id));

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

  return (
    <div id={`doctor-client-profile-page-${userId}`} className="flex flex-col gap-3">
      <header
        id="doctor-client-identity-header"
        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <h2
          id="doctor-client-display-name"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {displayHeading}
        </h2>
      </header>

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

      <div className="flex flex-col gap-3">
        <AccItem id="contacts" title="Контакты и каналы" openSection={openSection} onToggle={toggle}>
          <div className="flex flex-col gap-4">
            {identity.phone ? (
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
            ) : (
              <p>Телефон не указан</p>
            )}
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
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Чат поддержки (веб-приложение)
            </p>
            <p>
              <Link
                href="/app/doctor/messages"
                className="text-primary underline"
                id="doctor-client-open-support-chat-link"
              >
                Открыть раздел сообщений
              </Link>
            </p>
          </div>
        </AccItem>

        {canEditClientProfile ? (
          <AccItem id="admin-profile" title="Редактирование ФИО, телефона и email" openSection={openSection} onToggle={toggle}>
            <AdminClientProfileEditPanel
              userId={userId}
              displayName={identity.displayName}
              firstName={identity.firstName}
              lastName={identity.lastName}
              email={identity.email}
              emailVerifiedAt={identity.emailVerifiedAt}
              phone={identity.phone}
            />
          </AccItem>
        ) : null}

        <AccItem id="lifecycle" title="Учётная запись и архив" openSection={openSection} onToggle={toggle}>
          <DoctorClientLifecycleActions
            userId={userId}
            isArchived={identity.isArchived}
            listBasePath={listBasePath}
            isAdmin={isAdmin}
            canPermanentDelete={canPermanentDelete}
          />
        </AccItem>

        <AccItem id="appointments" title="Ближайшие записи" openSection={openSection} onToggle={toggle}>
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
        </AccItem>

        <AccItem id="appointment-history" title="История записей" openSection={openSection} onToggle={toggle}>
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
        </AccItem>

        <AccItem id="symptoms" title="Дневник симптомов" openSection={openSection} onToggle={toggle}>
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
        </AccItem>

        <AccItem id="lfk" title="Дневник ЛФК" openSection={openSection} onToggle={toggle}>
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
            <AssignLfkTemplatePanel
              patientUserId={userId}
              templates={publishedLfkTemplates}
              disabled={!assignLfkEnabled}
            />
          </div>
        </AccItem>

        <AccItem id="notes" title="Заметки врача" openSection={openSection} onToggle={toggle}>
          <DoctorNotesPanel userId={userId} />
        </AccItem>

        <AccItem id="subscriber" title="Блокировка подписчика" openSection={openSection} onToggle={toggle}>
          <SubscriberBlockPanel
            userId={userId}
            initiallyBlocked={identity.isBlocked}
            blockedReason={identity.blockedReason}
          />
        </AccItem>

        <AccItem id="communications" title="Коммуникации" openSection={openSection} onToggle={toggle}>
          <div className="flex flex-col gap-4">
            {messageDraft ? (
              <SendMessageForm
                userId={userId}
                availableChannels={messageDraft.availableChannels}
                channelBindings={messageDraft.channelBindings}
              />
            ) : (
              <p className="text-muted-foreground">Невозможно отправить сообщение (клиент не найден).</p>
            )}
            <h3 className="text-sm font-medium">История сообщений</h3>
            {messageHistory.length === 0 ? (
              <p className="text-muted-foreground">Сообщений пока нет.</p>
            ) : (
              <ul id="doctor-client-message-history-list" className="m-0 list-none space-y-3 p-0">
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
            )}
          </div>
        </AccItem>

        {isAdmin ? (
          <AccItem id="admin-danger" title="Опасные действия (admin)" openSection={openSection} onToggle={toggle}>
            <AdminDangerActions userId={userId} sampleIntegratorRecordId={sampleRecordId} />
          </AccItem>
        ) : null}

        {canPermanentDelete ? (
          <AccItem id="admin-merge" title="Объединение учётных записей (admin)" openSection={openSection} onToggle={toggle}>
            <AdminMergeAccountsPanel
              anchorUserId={userId}
              enabled
              suspendHeavyFetch={openSection !== "admin-merge"}
            />
          </AccItem>
        ) : null}

        {canPermanentDelete ? (
          <AccItem id="admin-audit" title="История операций (admin)" openSection={openSection} onToggle={toggle}>
            <AdminClientAuditHistorySection
              platformUserId={userId}
              enabled
              suspendLoad={openSection !== "admin-audit"}
            />
          </AccItem>
        ) : null}
      </div>

      <p id="doctor-client-back-link-container" className="pt-1">
        <Link
          id="doctor-client-back-link"
          href={listBasePath}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")}
        >
          {backLabel}
        </Link>
      </p>
    </div>
  );
}
