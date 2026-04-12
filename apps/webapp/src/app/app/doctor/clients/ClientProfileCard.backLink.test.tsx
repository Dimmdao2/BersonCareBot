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
  it("shows client display name in contacts block", () => {
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageDraft={null}
        messageHistory={[]}
        userId="u1"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );
    const nameEl = document.getElementById("doctor-client-display-name");
    expect(nameEl).not.toBeNull();
    expect(nameEl).toHaveTextContent("Test");
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
    const nameEl = document.getElementById("doctor-client-display-name");
    expect(nameEl).toHaveTextContent("Имя не указано");
  });

  it("wraps content in doctor-client-profile-page-{userId} including display name", () => {
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
    expect(root).toContainElement(document.getElementById("doctor-client-display-name"));
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
