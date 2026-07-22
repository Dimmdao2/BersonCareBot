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
});
