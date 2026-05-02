/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import { ClientProfileCard } from "./ClientProfileCard";

const sampleMessageHistoryEntry: MessageLogEntry = {
  id: "mh1",
  userId: "u1",
  senderId: "doc1",
  text: "Тестовое сообщение журнала",
  category: "reminder",
  channelBindingsUsed: {},
  sentAt: "2025-01-01T12:00:00.000Z",
  outcome: "sent",
};

vi.mock("@/modules/messaging/components/DoctorChatPanel", () => ({ DoctorChatPanel: () => null }));
vi.mock("./AssignLfkTemplatePanel", () => ({ AssignLfkTemplatePanel: () => null }));
vi.mock("./PatientTreatmentProgramsPanel", () => ({ PatientTreatmentProgramsPanel: () => null }));
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
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, unreadCount: 0 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows client display name in sticky header", () => {
    render(
      <ClientProfileCard
        profile={minimalProfile}
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
        messageHistory={[]}
        userId="u1"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );
    const root = container.querySelector("#doctor-client-profile-page-u1");
    expect(root).not.toBeNull();
    expect(root).toContainElement(document.getElementById("doctor-client-display-name"));
  });

  it("does not render legacy accordion trigger ids", () => {
    const { container } = render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[]}
        userId="u1"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );
    expect(container.querySelectorAll('[id^="doctor-client-acc-trigger-"]')).toHaveLength(0);
  });

  it("uses listBasePath with scope=all for href and подписчиков label", () => {
    const href = "/app/doctor/clients?scope=all";
    render(
      <ClientProfileCard
        profile={minimalProfile}
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
        messageHistory={[]}
        userId="u1"
        listBasePath={href}
      />,
    );
    const link = screen.getByRole("link", { name: /к списку клиентов/i });
    expect(link).toHaveAttribute("href", href);
  });

  it("renders support chat CTA instead of legacy send form", () => {
    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[sampleMessageHistoryEntry]}
        userId="00000000-0000-4000-8000-000000000111"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );

    const openChat = document.getElementById("doctor-client-open-support-chat-button");
    expect(openChat).not.toBeNull();
    expect(openChat).toHaveTextContent("Открыть чат");
    expect(screen.getByText(/единый чат поддержки/i)).toBeInTheDocument();
    expect(screen.getByText(/старый журнал отправок/i)).toBeInTheDocument();
  });

  it("shows support chat unread badge on CTA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, unreadCount: 2 }))),
    );

    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[]}
        userId="00000000-0000-4000-8000-000000000111"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );

    expect(await screen.findByRole("button", { name: /открыть чат 2/i })).toBeInTheDocument();
  });

  it("shows a clear error when patient is missing during chat ensure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/doctor/messages/conversations/unread-by-patient")) {
          return new Response(JSON.stringify({ ok: true, unreadCount: 0 }));
        }
        if (url.includes("/api/doctor/messages/conversations/ensure")) {
          return new Response(JSON.stringify({ ok: false, error: "patient_not_found" }), { status: 404 });
        }
        return new Response(JSON.stringify({ ok: true }));
      }),
    );

    render(
      <ClientProfileCard
        profile={minimalProfile}
        messageHistory={[]}
        userId="00000000-0000-4000-8000-000000000111"
        listBasePath="/app/doctor/clients?scope=all"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /открыть чат/i }));
    expect(await screen.findByText("Пациент не найден, чат открыть нельзя.")).toBeInTheDocument();
  });
});
