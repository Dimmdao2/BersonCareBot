/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("ClientProfileCard anchor routing", () => {
  beforeEach(() => {
    window.location.hash = "";
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
        return new Response(JSON.stringify({ ok: true, unreadCount: 0 }));
      }),
    );
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
});
