/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatientMessagesClient } from "./PatientMessagesClient";

vi.mock("@/modules/messaging/hooks/useMessagePolling", () => ({
  useMessagePolling: vi.fn(),
}));

const conversationId = "00000000-0000-4000-8000-000000000222";

describe("PatientMessagesClient", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps patient composer geometry and sends the trimmed draft through the existing API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/patient/messages" && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url === "/api/patient/messages/read") {
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(
        JSON.stringify({ ok: true, conversationId, messages: [] }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PatientMessagesClient />);

    const input = await screen.findByRole("textbox", { name: "Текст сообщения" });
    const send = screen.getByRole("button", { name: "Отправить" });
    expect(input).toHaveClass("min-h-[56px]");
    expect(send).toBeDisabled();

    await userEvent.click(input);
    expect(input).toHaveClass("min-h-[112px]");
    await userEvent.type(input, "  Ответ пациента  ");
    await userEvent.click(send);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/patient/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Ответ пациента", conversationId }),
      });
    });
    expect(input).toHaveValue("");
    expect(input).toHaveClass("min-h-[56px]");
  });

  it("renders a closed conversation as read-only history: no composer, an explanation instead", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/patient/messages/read") {
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(
        JSON.stringify({
          ok: true,
          conversationId,
          readOnly: true,
          messages: [
            {
              id: "m-closed-1",
              integratorMessageId: "x1",
              conversationId,
              senderRole: "admin",
              messageType: "text",
              text: "Ответ поддержки в закрытом обращении",
              source: "webapp",
              createdAt: "2026-01-01T12:00:00.000Z",
              readAt: null,
              deliveredAt: null,
              mediaUrl: null,
              mediaType: null,
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PatientMessagesClient />);

    // History renders — the thread is never hidden or reported missing.
    expect(await screen.findByText("Ответ поддержки в закрытом обращении")).toBeInTheDocument();
    expect(screen.getByTestId("patient-messages-readonly-notice")).toBeInTheDocument();
    // No control that would appear and then be refused by the server.
    expect(screen.queryByRole("textbox", { name: "Текст сообщения" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Отправить" })).toBeNull();
    // Marking read is still attempted and is expected to succeed.
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/patient/messages/read",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("drops the composer when a send is refused because the conversation was closed meanwhile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/patient/messages" && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: false, error: "conversation_closed" }), { status: 409 });
      }
      if (url === "/api/patient/messages/read") {
        return new Response(JSON.stringify({ ok: true }));
      }
      return new Response(JSON.stringify({ ok: true, conversationId, messages: [], readOnly: false }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PatientMessagesClient />);

    const input = await screen.findByRole("textbox", { name: "Текст сообщения" });
    await userEvent.type(input, "Привет");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));

    expect(await screen.findByTestId("patient-messages-readonly-notice")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Текст сообщения" })).toBeNull();
    // The raw error code is never shown to the patient.
    expect(screen.queryByText("conversation_closed")).toBeNull();
  });
});
