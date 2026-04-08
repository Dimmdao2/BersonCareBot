/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { ClientProfileCard } from "./ClientProfileCard";

vi.mock("./[userId]/SendMessageForm", () => ({ SendMessageForm: () => null }));
vi.mock("./AssignLfkTemplatePanel", () => ({ AssignLfkTemplatePanel: () => null }));
vi.mock("./AdminDangerActions", () => ({ AdminDangerActions: () => null }));
vi.mock("./DoctorClientLifecycleActions", () => ({ DoctorClientLifecycleActions: () => null }));
vi.mock("./DoctorNotesPanel", () => ({ DoctorNotesPanel: () => null }));
vi.mock("./SubscriberBlockPanel", () => ({ SubscriberBlockPanel: () => null }));

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
  },
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

describe("ClientProfileCard back link (scope)", () => {
  it("uses listBasePath with scope=all for href and подписчиков label", () => {
    const href = "/app/doctor/clients?scope=all";
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageDraft={null}
        messageHistory={[]}
        userId="u1"
        listBasePath={href}
      />,
    );
    const link = screen.getByRole("link", { name: /к списку подписчиков/i });
    expect(link).toHaveAttribute("href", href);
  });

  it("uses listBasePath with scope=appointments for href and клиентов label", () => {
    const href = "/app/doctor/clients?scope=appointments";
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageDraft={null}
        messageHistory={[]}
        userId="u1"
        listBasePath={href}
      />,
    );
    const link = screen.getByRole("link", { name: /к списку клиентов/i });
    expect(link).toHaveAttribute("href", href);
  });
});
