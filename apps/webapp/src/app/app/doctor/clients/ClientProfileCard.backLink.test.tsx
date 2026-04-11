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
    channelBindingDates: {},
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
  it("shows client display name as prominent heading", () => {
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageDraft={null}
        messageHistory={[]}
        userId="u1"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Test" });
    expect(heading).toHaveAttribute("id", "doctor-client-display-name");
  });

  it("shows placeholder when display name is empty", () => {
    const profileEmptyName: ClientProfile = {
      ...minimalProfile,
      identity: { ...minimalProfile.identity, displayName: "   " },
    };
    render(
      <ClientProfileCard
        profile={profileEmptyName}
        messageDraft={null}
        messageHistory={[]}
        userId="u1"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Имя не указано" })).toBeInTheDocument();
  });

  it("wraps content in doctor-client-profile-page-{userId} including identity heading", () => {
    const { container } = render(
      <ClientProfileCard
        profile={minimalProfile}
        messageDraft={null}
        messageHistory={[]}
        userId="u1"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );
    const root = container.querySelector("#doctor-client-profile-page-u1");
    expect(root).not.toBeNull();
    expect(root).toContainElement(screen.getByRole("heading", { level: 2, name: "Test" }));
  });

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
