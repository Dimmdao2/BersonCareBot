/** @vitest-environment jsdom */
/**
 * PatientTabComms — layout structure tests.
 *
 * Verifies the chat section has the bounded-height container class that enables
 * the ChatView scroll region. Mocks DoctorClientEmbeddedChat (which needs fetch)
 * and DoctorProgramInstanceDiscussionDialog (which has portal deps).
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientTabComms } from "./PatientTabComms";

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@/app/app/doctor/clients/DoctorClientEmbeddedChat", () => ({
  DoctorClientEmbeddedChat: ({ patientUserId }: { patientUserId: string }) => (
    <div data-testid="mock-chat" data-patient={patientUserId}>chat</div>
  ),
}));

vi.mock(
  "@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/DoctorProgramInstanceDiscussionDialog",
  () => ({
    DoctorProgramInstanceDiscussionDialog: () => null,
  }),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function stubFetch(response: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(response))),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PatientTabComms layout", () => {
  beforeEach(() => {
    stubFetch({ ok: true, items: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the Чат section title", async () => {
    render(<PatientTabComms userId="u1" />);
    expect(screen.getByText("Чат")).toBeInTheDocument();
  });

  it("renders the chat inside a bounded-height flex-col container", () => {
    const { container } = render(<PatientTabComms userId="u1" />);

    // The chat card must carry flex-col + overflow-hidden so the inner
    // ChatView scroll region is properly constrained.
    // In jsdom Tailwind classes are not compiled; we inspect the raw class string.
    const chatCard = screen.getByTestId("mock-chat").closest('[class]');
    // Walk up to find the card container (the one with overflow-hidden + flex-col)
    let el: Element | null = screen.getByTestId("mock-chat").parentElement;
    let chatCardEl: Element | null = null;
    while (el && el !== container) {
      const cls = el.className ?? "";
      if (cls.includes("overflow-hidden") && cls.includes("flex-col")) {
        chatCardEl = el;
        break;
      }
      el = el.parentElement;
    }

    expect(chatCardEl).not.toBeNull();
    // The card must also have the bounded-height class
    expect(chatCardEl?.className).toMatch(/min\(65vh/);
    // rounded + border + bg-card (card chrome)
    expect(chatCardEl?.className).toMatch(/rounded-xl/);
  });

  it("passes userId to DoctorClientEmbeddedChat", () => {
    render(<PatientTabComms userId="patient-abc" />);
    const mockChat = screen.getByTestId("mock-chat");
    expect(mockChat).toHaveAttribute("data-patient", "patient-abc");
  });

  it("renders Комментарии к программе section title", async () => {
    render(<PatientTabComms userId="u1" />);
    expect(screen.getByText("Комментарии к программе")).toBeInTheDocument();
  });

  it("shows Нет активной программы when fetch returns empty items", async () => {
    render(<PatientTabComms userId="u1" />);
    expect(await screen.findByText("Нет активной программы")).toBeInTheDocument();
  });
});
