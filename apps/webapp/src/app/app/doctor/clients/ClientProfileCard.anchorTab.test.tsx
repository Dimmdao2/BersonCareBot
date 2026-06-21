/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { ClientProfileCard } from "./ClientProfileCard";

vi.mock("@/modules/messaging/components/DoctorChatPanel", () => ({ DoctorChatPanel: () => null }));
vi.mock("./DoctorLfkComplexExerciseOverridesPanel", () => ({ DoctorLfkComplexExerciseOverridesPanel: () => null }));
vi.mock("./PatientTreatmentProgramsPanel", () => ({ PatientTreatmentProgramsPanel: () => null }));
vi.mock("./AdminDangerActions", () => ({ AdminDangerActions: () => null }));
vi.mock("./DoctorClientLifecycleActions", () => ({ DoctorClientLifecycleActions: () => null }));
vi.mock("./DoctorNotesPanel", () => ({ DoctorNotesPanel: () => null }));
vi.mock("./ClientBookingHistoryPanel", () => ({ ClientBookingHistoryPanel: () => null }));
vi.mock("./SubscriberBlockPanel", () => ({ SubscriberBlockPanel: () => null }));
vi.mock("./DoctorClientSupportPanel", () => ({ DoctorClientSupportPanel: () => null }));
vi.mock("./DoctorClientSupportCareBar", () => ({
  DoctorClientSupportCareBar: () => <div id="doctor-client-section-support" />,
}));
vi.mock("./DoctorProgramOverviewPanel", () => ({
  DoctorProgramOverviewPanel: () => <div data-testid="program-overview-panel" />,
}));

const minimalProfile: ClientProfile = {
  identity: {
    userId: "u1",
    displayName: "Test",
    phone: null,
    bindings: {},
    createdAt: null,
    isBlocked: false,
    blockedReason: null,
    isArchived: false,
    channelBindingDates: {},
  },
  supplementaryContacts: [],
  channelCards: [],
  upcomingAppointments: [],
  appointmentHistory: [],
  appointmentStats: {
    total: 0,
    cancellations30d: 0,
    lastVisitLabel: null,
    nextVisitLabel: null,
  },
  symptomTrackings: [],
  recentSymptomEntries: [],
  lfkComplexes: [],
  recentLfkSessions: [],
};

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("support-settings")) {
        return new Response(
          JSON.stringify({
            ok: true,
            effectivePolicy: { onSupport: false, commentsAllowed: false, mediaAllowed: false },
          }),
        );
      }
      if (url.includes("conversations/ensure")) {
        return new Response(
          JSON.stringify({
            ok: true,
            conversationId: "conv-1",
            messages: [],
            unreadFromUserCount: 0,
          }),
        );
      }
      return new Response(JSON.stringify({ ok: true, unreadCount: 0 }));
    }),
  );
}

describe("ClientProfileCard anchor routing", () => {
  beforeEach(() => {
    window.location.hash = "";
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.location.hash = "";
  });

  it("opens program tab for #doctor-client-section-treatment-programs", async () => {
    window.location.hash = "#doctor-client-section-treatment-programs";
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[] as MessageLogEntry[]}
        userId="u1"
      />,
    );
    await waitFor(() => {
      expect(document.getElementById("doctor-client-section-treatment-programs")).toBeTruthy();
    });
  });

  it("renders active program tree on program tab (correction mode)", async () => {
    window.location.hash = "#doctor-client-section-treatment-programs";
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[] as MessageLogEntry[]}
        userId="u1"
        profileListScope="appointments"
        activeProgramTree={{
          instanceId: "inst-1",
          instanceTitle: "План реабилитации",
          defaultExpandedStageId: "st-1",
          stages: [
            {
              id: "st-1",
              title: "Этап 1",
              status: "in_progress",
              statusLabel: "В работе",
              groups: [],
              ungroupedItems: [
                {
                  id: "item-1",
                  title: "Разминка",
                  itemType: "lfk_exercise",
                  itemTypeLabel: "Упражнение",
                  isNew: false,
                },
              ],
            },
          ],
        }}
      />,
    );
    // With activeProgramTree set, the "Программа" tab opens in "overview" mode by default.
    // Switch to "Коррекция" mode to render the tree items via DoctorClientActiveProgramPanel.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Коррекция" })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { name: "Коррекция" }));
    await waitFor(() => {
      expect(screen.getByText("Разминка")).toBeInTheDocument();
    });
    const itemLink = screen.getByRole("link", { name: /Разминка/ });
    expect(itemLink.getAttribute("href")).toContain("discussionItem=item-1");
    expect(itemLink.getAttribute("href")).toContain("scope=appointments");
  });

  it("opens program tab for #doctor-client-section-pending-program-tests", async () => {
    window.location.hash = "#doctor-client-section-pending-program-tests";
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[] as MessageLogEntry[]}
        userId="u1"
        focusPendingProgramAttemptId="a1"
        pendingProgramTestEvaluations={[
          {
            resultId: "r1",
            attemptId: "a1",
            attemptSubmittedAt: "2025-01-01T00:00:00.000Z",
            instanceId: "i1",
            instanceTitle: "План",
            stageTitle: "Этап",
            stageItemId: "si1",
            testId: "t1",
            testTitle: "Тест",
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ]}
      />,
    );
    await waitFor(() => {
      expect(document.getElementById("doctor-client-section-pending-program-tests")).toBeTruthy();
    });
    expect(document.getElementById("doctor-client-pending-attempt-a1")?.className).toContain("ring-primary");
  });

  it("opens communications tab for #doctor-client-section-communications", async () => {
    window.location.hash = "#doctor-client-section-communications";
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[] as MessageLogEntry[]}
        userId="u1"
      />,
    );
    await waitFor(() => {
      expect(document.getElementById("doctor-client-section-communications")).toBeTruthy();
    });
  });

  it("opens communications tab when autoOpenChat is true", async () => {
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[] as MessageLogEntry[]}
        userId="u1"
        autoOpenChat
      />,
    );
    await waitFor(() => {
      expect(document.getElementById("doctor-client-section-communications")).toBeTruthy();
    });
  });
});

describe("ClientProfileCard wellbeing expand", () => {
  beforeEach(() => {
    stubFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("expands full chart on Подробный график click", async () => {
    const user = userEvent.setup();
    render(
      <ClientProfileCard
        profile={{
          ...minimalProfile,
          recentSymptomEntries: [
            {
              id: "e1",
              userId: "u1",
              trackingId: "t1",
              value0_10: 7,
              entryType: "instant",
              recordedAt: new Date().toISOString(),
              source: "webapp",
              notes: null,
              createdAt: "2025-01-01T00:00:00.000Z",
            },
          ],
          symptomTrackings: [
            {
              id: "t1",
              userId: "u1",
              symptomKey: "general_wellbeing",
              symptomTitle: "Самочувствие",
              isActive: true,
              createdAt: "2025-01-01T00:00:00.000Z",
              updatedAt: "2025-01-01T00:00:00.000Z",
            },
          ],
        }}
        messageHistory={[] as MessageLogEntry[]}
        userId="u1"
        wellbeingChartModel={{
          aggregateSeries: [],
          instantSeries: [{ t: Date.now(), v: 7 }],
          warmupScatter: [],
          weekStartMs: 0,
          weekEndMs: Date.now() + 1,
        }}
        displayTimeZone="Europe/Moscow"
      />,
    );

    const expandBtn = await screen.findByRole("button", { name: "Подробный график" });
    await user.click(expandBtn);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Свернуть" })).toBeTruthy();
    });
  });
});
