/**
 * Карточка клиента: Hero + Action Strip + табы (фаза 2B CARD_REDESIGN_PLAN).
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import type {
  DoctorClientOverviewCarePlanModel,
  DoctorClientProgramCardAggregates,
  DoctorClientProgramInboxRow,
  DoctorClientTabId,
} from "@/modules/doctor-client-card/types";
import { PatientCareBar } from "./PatientCareBar";
import {
  PatientActionStrip,
  programTabBadgeCount,
  ProgramTabBadge,
} from "./PatientActionStrip";
import { useDoctorClientAnchorTab } from "./useDoctorClientAnchorTab";
import { DoctorClientOverviewTab } from "./DoctorClientOverviewTab";
import { DoctorClientProgramTab } from "./DoctorClientProgramTab";
import { DoctorClientCommunicationsTab } from "./DoctorClientCommunicationsTab";
import { DoctorClientRecordsTab } from "./DoctorClientRecordsTab";
import { DoctorClientAccountTab } from "./DoctorClientAccountTab";

const EMPTY_AGGREGATES: DoctorClientProgramCardAggregates = {
  newCommentsCount: 0,
  patientMediaCount: 0,
  planNotOpened: false,
  lastPlanMutationEventAt: null,
};

type ClientProfileCardProps = {
  profile: ClientProfile;
  messageHistory: MessageLogEntry[];
  userId: string;
  listBasePath?: string;
  profileListScope?: string;
  isAdmin?: boolean;
  canPermanentDelete?: boolean;
  canEditClientProfile?: boolean;
  publishedTreatmentProgramTemplates?: { id: string; title: string }[];
  assignTreatmentProgramEnabled?: boolean;
  pendingProgramTestEvaluations?: PendingProgramTestEvaluationRow[];
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  lfkExerciseLinesByComplexId?: Record<string, LfkComplexExerciseLine[]>;
  autoOpenChat?: boolean;
  programCardAggregates?: DoctorClientProgramCardAggregates;
  carePlanOverview?: DoctorClientOverviewCarePlanModel | null;
  programInbox?: DoctorClientProgramInboxRow[];
  displayTimeZone?: string;
  wellbeingChartModel?: WellbeingWeekChartModel;
};

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
  autoOpenChat = false,
  programCardAggregates = EMPTY_AGGREGATES,
  carePlanOverview = null,
  programInbox = [],
  displayTimeZone = "Europe/Moscow",
  wellbeingChartModel,
}: ClientProfileCardProps) {
  const { identity, upcomingAppointments, appointmentHistory } = profile;
  const { activeTab, setActiveTab, applyAnchor } = useDoctorClientAnchorTab("overview");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatInitialMessages, setChatInitialMessages] = useState<SerializedSupportMessage[] | null>(null);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

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
  const pendingTestsCount = pendingProgramTestEvaluations.length;
  const programBadge = programTabBadgeCount(pendingTestsCount, programCardAggregates);

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
      // optional badge
    }
  }, [userId]);

  useEffect(() => {
    void loadPatientUnreadCount();
  }, [loadPatientUnreadCount]);

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

  const autoOpenChatStarted = useRef(false);
  useEffect(() => {
    if (!autoOpenChat || autoOpenChatStarted.current) return;
    autoOpenChatStarted.current = true;
    void openPatientChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot from URL
  }, [autoOpenChat]);

  const navigateProgram = () => {
    setActiveTab("program");
    applyAnchor("doctor-client-section-treatment-programs");
  };

  const wellbeingModelResolved =
    wellbeingChartModel ??
    ({
      aggregateSeries: [],
      instantSeries: [],
      warmupScatter: [],
      weekStartMs: 0,
      weekEndMs: 0,
    } satisfies WellbeingWeekChartModel);

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
        <PatientCareBar
          identity={identity}
          firstUpcoming={firstUpcoming}
          chatUnreadCount={chatUnreadCount}
          onOpenChat={() => void openPatientChat()}
          onNavigateAnchor={applyAnchor}
        />

        <PatientActionStrip
          pendingTestsCount={pendingTestsCount}
          chatUnreadCount={chatUnreadCount}
          aggregates={programCardAggregates}
          onNavigateTab={setActiveTab}
          onOpenChat={() => void openPatientChat()}
          onNavigateAnchor={applyAnchor}
        />

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as DoctorClientTabId)}
          className="gap-0"
        >
          <div className="overflow-x-auto border-b border-border px-2">
            <TabsList variant="line" className="h-auto w-max min-w-full justify-start gap-0 bg-transparent p-0">
              <TabsTrigger value="overview" className="rounded-none px-3 py-2">
                Обзор
              </TabsTrigger>
              <TabsTrigger value="program" className="rounded-none px-3 py-2">
                Программа
                <ProgramTabBadge count={programBadge} />
              </TabsTrigger>
              <TabsTrigger value="communications" className="rounded-none px-3 py-2">
                Коммуникации
                <ProgramTabBadge count={chatUnreadCount} />
              </TabsTrigger>
              <TabsTrigger value="records" className="rounded-none px-3 py-2">
                Записи
              </TabsTrigger>
              <TabsTrigger value="account" className="rounded-none px-3 py-2">
                Учётка
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-0 outline-none">
            <DoctorClientOverviewTab
              userId={userId}
              profileListScope={profileListScope}
              treatmentProgramInstancesInitial={treatmentProgramInstancesInitial}
              carePlan={carePlanOverview}
              programAggregates={programCardAggregates}
              assignTreatmentProgramEnabled={assignTreatmentProgramEnabled}
              wellbeingModel={wellbeingModelResolved}
              displayTimeZone={displayTimeZone}
              onNavigateProgram={navigateProgram}
            />
          </TabsContent>

          <TabsContent value="program" className="mt-0 outline-none">
            <DoctorClientProgramTab
              userId={userId}
              profileListScope={profileListScope}
              publishedTreatmentProgramTemplates={publishedTreatmentProgramTemplates}
              assignTreatmentProgramEnabled={assignTreatmentProgramEnabled}
              treatmentProgramInstancesInitial={treatmentProgramInstancesInitial}
              pendingProgramTestEvaluations={pendingProgramTestEvaluations}
              programInbox={programInbox}
            />
          </TabsContent>

          <TabsContent value="communications" className="mt-0 outline-none">
            <DoctorClientCommunicationsTab
              messageHistory={messageHistory}
              chatUnreadCount={chatUnreadCount}
              onOpenChat={() => void openPatientChat()}
            />
          </TabsContent>

          <TabsContent value="records" className="mt-0 outline-none">
            <DoctorClientRecordsTab userId={userId} profile={profile} />
          </TabsContent>

          <TabsContent value="account" className="mt-0 outline-none">
            <DoctorClientAccountTab
              profile={profile}
              userId={userId}
              listBasePath={listBasePath}
              canEditClientProfile={canEditClientProfile}
              isAdmin={isAdmin}
              canPermanentDelete={canPermanentDelete}
              sampleRecordId={sampleRecordId}
              lfkExerciseLinesByComplexId={lfkExerciseLinesByComplexId}
            />
          </TabsContent>
        </Tabs>
      </article>

      <p id="doctor-client-back-link-container" className="pt-1">
        <Link
          id="doctor-client-back-link"
          href={listBasePath}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted",
          )}
        >
          {backLabel}
        </Link>
      </p>

      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent
          className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          showCloseButton={!chatLoading}
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12">
            <DialogTitle>Чат с пациентом</DialogTitle>
            <DialogDescription>{displayHeading}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3">
            {chatLoading ? <p className="text-sm text-muted-foreground">Открываем чат...</p> : null}
            {chatError ? <p className="text-sm text-destructive">{chatError}</p> : null}
            {!chatLoading && !chatError && chatConversationId ? (
              <DoctorChatPanel
                key={chatConversationId}
                conversationId={chatConversationId}
                initialMessages={chatInitialMessages ?? []}
                className="min-h-0 flex-1"
                onReadStateChanged={() => setChatUnreadCount(0)}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
