/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DoctorChatPanel } from "./DoctorChatPanel";
import type { SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";

vi.mock("@/modules/messaging/hooks/useMessagePolling", () => ({
  useMessagePolling: vi.fn(),
}));

const conversationId = "00000000-0000-4000-8000-000000000222";

const message: SerializedSupportMessage = {
  id: "m1",
  integratorMessageId: "i1",
  conversationId,
  senderRole: "user",
  messageType: "text",
  text: "Здравствуйте",
  source: "webapp",
  createdAt: "2026-01-01T10:00:00.000Z",
  readAt: null,
  deliveredAt: null,
  mediaUrl: null,
  mediaType: null,
};

describe("DoctorChatPanel", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders initial messages and marks the conversation read", async () => {
    const onReadStateChanged = vi.fn();
    const unreadRefreshListener = vi.fn();
    window.addEventListener("bersoncare:doctor-support-unread-refresh", unreadRefreshListener);
    render(
      <DoctorChatPanel
        conversationId={conversationId}
        initialMessages={[message]}
        onReadStateChanged={onReadStateChanged}
      />,
    );

    expect(await screen.findByText("Здравствуйте")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(`/api/doctor/messages/${conversationId}/read`, { method: "POST" });
    });
    expect(onReadStateChanged).toHaveBeenCalled();
    expect(unreadRefreshListener).toHaveBeenCalled();
    window.removeEventListener("bersoncare:doctor-support-unread-refresh", unreadRefreshListener);
  });

  it("sends a reply, reloads messages, and calls onSent", async () => {
    const onSent = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, messages: [message] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorChatPanel conversationId={conversationId} initialMessages={[message]} onSent={onSent} />);

    const input = await screen.findByLabelText("Текст ответа");
    await userEvent.type(input, "Ответ врача");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(`/api/doctor/messages/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Ответ врача" }),
      });
    });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(screen.getByLabelText("Текст ответа")).toHaveValue("");
  });

  it("shows an error when initial load fails", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<DoctorChatPanel conversationId={conversationId} />);

    expect(await screen.findByText("Не удалось загрузить сообщения")).toBeInTheDocument();
  });
});
