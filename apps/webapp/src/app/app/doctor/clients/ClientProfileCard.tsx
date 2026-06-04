/**
 * Карточка клиента: Hero + Action Strip + табы (фаза 2B CARD_REDESIGN_PLAN).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/doctor/primitives/tabs";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { LfkComplexExerciseLine } from "@/modules/diaries/types";
import type {
  PendingProgramTestEvaluationRow,
  TreatmentProgramInstanceSummary,
} from "@/modules/treatment-program/types";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import type {
  DoctorClientActiveProgramTreeModel,
  DoctorClientOverviewCarePlanModel,
  DoctorClientProgramCardAggregates,
  DoctorClientProgramInboxRow,
  DoctorClientRecentProgramChangeRow,
  DoctorClientTabId,
  DoctorClientTaskSummary,
} from "@/modules/doctor-client-card/types";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
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
import { DoctorClientCardAdminSection } from "./DoctorClientCardAdminSection";
import {
  doctorClientBackLinkClass,
  doctorClientBlockedBannerClass,
  doctorClientProfileCardClass,
  doctorClientProfileStickyShellClass,
  doctorClientTabTriggerClass,
  doctorClientTabsListClass,
  doctorClientTabsScrollClass,
} from "./doctorClientCardChrome";
import { doctorPageStackClass } from "@/shared/ui/doctor/doctorVisual";

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
  activeProgramTree?: DoctorClientActiveProgramTreeModel | null;
  programInbox?: DoctorClientProgramInboxRow[];
  recentProgramChanges?: DoctorClientRecentProgramChangeRow[];
  displayTimeZone?: string;
  wellbeingChartModel?: WellbeingWeekChartModel;
  taskSummary?: DoctorClientTaskSummary | null;
  proactiveInsights?: ProactiveInsightRow[];
  focusPendingProgramAttemptId?: string;
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
  activeProgramTree = null,
  programInbox = [],
  recentProgramChanges = [],
  displayTimeZone = "Europe/Moscow",
  wellbeingChartModel,
  taskSummary = null,
  proactiveInsights = [],
  focusPendingProgramAttemptId,
}: ClientProfileCardProps) {
  const { identity, upcomingAppointments, appointmentHistory } = profile;
  const { activeTab, setActiveTab, applyAnchor } = useDoctorClientAnchorTab(
    autoOpenChat ? "communications" : "overview",
  );

  const [chatUnreadCount, setChatUnreadCount] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/doctor/messages/conversations/unread-by-patient", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientUserId: userId }),
        });
        const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
        if (!cancelled && res.ok && data.ok && typeof data.unreadCount === "number") {
          setChatUnreadCount(data.unreadCount);
        }
      } catch {
        // optional badge
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const openCommunications = useCallback(() => {
    applyAnchor("doctor-client-section-communications");
  }, [applyAnchor]);

  useEffect(() => {
    if (!autoOpenChat) return;
    applyAnchor("doctor-client-section-communications", { replaceHash: true });
  }, [autoOpenChat, applyAnchor]);

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
    <div id={`doctor-client-profile-page-${userId}`} className={doctorPageStackClass}>
      {identity.isBlocked ? (
        <div
          id="doctor-client-blocked-banner"
          className={doctorClientBlockedBannerClass}
          role="status"
        >
          Подписчик заблокирован для отправки сообщений в чат поддержки
          {identity.blockedReason ? `: ${identity.blockedReason}` : "."}
        </div>
      ) : null}

      <article
        id={`doctor-client-profile-card-${userId}`}
        className={doctorClientProfileCardClass}
      >
        <div className={doctorClientProfileStickyShellClass}>
          <PatientCareBar
            identity={identity}
            firstUpcoming={firstUpcoming}
            chatUnreadCount={chatUnreadCount}
            onOpenChat={openCommunications}
            onNavigateAnchor={applyAnchor}
            taskSummary={taskSummary}
          />

          <PatientActionStrip
            pendingTestsCount={pendingTestsCount}
            chatUnreadCount={chatUnreadCount}
            aggregates={programCardAggregates}
            openTasksCount={taskSummary?.openCount ?? 0}
            onNavigateTab={setActiveTab}
            onNavigateAnchor={applyAnchor}
          />
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as DoctorClientTabId)}
          className="gap-0"
        >
          <div className={doctorClientTabsScrollClass}>
            <TabsList variant="line" className={doctorClientTabsListClass}>
              <TabsTrigger value="overview" className={doctorClientTabTriggerClass}>
                Обзор
              </TabsTrigger>
              <TabsTrigger value="program" className={doctorClientTabTriggerClass}>
                Программа
                <ProgramTabBadge count={programBadge} />
              </TabsTrigger>
              <TabsTrigger value="communications" className={doctorClientTabTriggerClass}>
                Коммуникации
                <ProgramTabBadge count={chatUnreadCount} />
              </TabsTrigger>
              <TabsTrigger value="records" className={doctorClientTabTriggerClass}>
                Записи
              </TabsTrigger>
              <TabsTrigger value="account" className={doctorClientTabTriggerClass}>
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
              recentProgramChanges={recentProgramChanges}
              assignTreatmentProgramEnabled={assignTreatmentProgramEnabled}
              wellbeingModel={wellbeingModelResolved}
              displayTimeZone={displayTimeZone}
              proactiveInsights={proactiveInsights}
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
              activeProgramTree={activeProgramTree}
              focusPendingProgramAttemptId={focusPendingProgramAttemptId}
            />
          </TabsContent>

          <TabsContent value="communications" className="mt-0 outline-none">
            <DoctorClientCommunicationsTab
              patientUserId={userId}
              messageHistory={messageHistory}
              onUnreadChange={setChatUnreadCount}
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
              lfkExerciseLinesByComplexId={lfkExerciseLinesByComplexId}
            />
          </TabsContent>
        </Tabs>
      </article>

      <DoctorClientCardAdminSection
        userId={userId}
        isAdmin={isAdmin}
        canPermanentDelete={canPermanentDelete}
        sampleRecordId={sampleRecordId}
      />

      <p id="doctor-client-back-link-container" className="pt-1">
        <Link
          id="doctor-client-back-link"
          href={listBasePath}
          className={doctorClientBackLinkClass}
        >
          {backLabel}
        </Link>
      </p>
    </div>
  );
}
