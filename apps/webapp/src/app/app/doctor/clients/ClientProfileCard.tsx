/**
 * Карточка клиента: Hero + Action Strip + табы (фаза 2B CARD_REDESIGN_PLAN).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClientProfile } from "@/modules/doctor-clients/service";
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
  DoctorClientTaskSummary,
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
import { DoctorClientCardAdminSection } from "./DoctorClientCardAdminSection";

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
  taskSummary?: DoctorClientTaskSummary | null;
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
  taskSummary = null,
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

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as DoctorClientTabId)}
          className="gap-0"
        >
          <div className="sticky top-[var(--doctor-sticky-offset,0px)] z-[9] overflow-x-auto border-b border-border bg-card px-2">
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
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted",
          )}
        >
          {backLabel}
        </Link>
      </p>
    </div>
  );
}
