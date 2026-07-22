/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatView } from "./ChatView";
import type { SerializedSupportMessage } from "../serializeSupportMessage";

function supportMessage(overrides: Partial<SerializedSupportMessage> & Pick<SerializedSupportMessage, "senderRole">): SerializedSupportMessage {
  return {
    id: "m1",
    integratorMessageId: overrides.integratorMessageId ?? "",
    conversationId: "c1",
    senderRole: overrides.senderRole,
    messageType: "text",
    text: overrides.text ?? "Текст",
    source: "webapp",
    createdAt: overrides.createdAt ?? "2026-06-07T10:00:00.000Z",
    readAt: overrides.readAt ?? null,
    deliveredAt: null,
    mediaUrl: null,
    mediaType: null,
  };
}

describe("ChatView delivery ticks", () => {
  it("shows sent tick on outgoing patient message without readAt", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <ChatView
        variant="patient"
        relativeFooters
        messages={[supportMessage({ senderRole: "user", readAt: null })]}
        composer={null}
      />,
    );
    expect(screen.getByText("Текст")).toBeInTheDocument();
    expect(document.querySelector('[data-delivery-status="sent"]')).toBeInTheDocument();
    expect(document.querySelector(".overflow-y-auto")).toHaveClass(
      "bg-[url('/images/chat-thread-gradient.png')]",
      "bg-cover",
      "bg-center",
      "bg-no-repeat",
    );
  });

  it("shows read tick on outgoing doctor message when patient read it", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <ChatView
        variant="doctor"
        messages={[
          supportMessage({
            senderRole: "admin",
            text: "Ответ врача",
            readAt: "2026-06-07T10:05:00.000Z",
          }),
        ]}
        composer={null}
      />,
    );
    expect(screen.getByText("Ответ врача")).toBeInTheDocument();
    expect(document.querySelector('[data-delivery-status="read"]')).toBeInTheDocument();
    expect(document.querySelector(".overflow-y-auto")).toHaveClass(
      "bg-[url('/images/chat-thread-gradient.png')]",
      "bg-cover",
      "bg-center",
      "bg-no-repeat",
    );
  });
});

describe("ChatView message links and actions", () => {
  afterEach(() => {
    delete window.Telegram;
  });

  it("linkifies only http(s) URLs and opens them in a new tab", () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(
      <ChatView
        variant="doctor"
        messages={[
          supportMessage({
            senderRole: "user",
            text: "Откройте https://example.com/path?q=1. javascript:alert(1)",
          }),
        ]}
        composer={null}
      />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/path?q=1" });
    expect(link).toHaveAttribute("href", "https://example.com/path?q=1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: /javascript/i })).not.toBeInTheDocument();
  });

  it.each(["doctor", "patient"] as const)("opens a pasted URL externally in a hosted %s chat", async (variant) => {
    Element.prototype.scrollIntoView = vi.fn();
    const openLink = vi.fn();
    type TelegramWebAppWithOpenLink = NonNullable<typeof window.Telegram>["WebApp"] & {
      openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
    };
    window.Telegram = {
      WebApp: { initData: "hosted-init-data", openLink } as TelegramWebAppWithOpenLink,
    };
    const user = userEvent.setup();

    render(
      <ChatView
        variant={variant}
        messages={[supportMessage({ senderRole: "user", text: "Откройте https://example.com/path" })]}
        composer={null}
      />,
    );

    const link = screen.getByRole("link", { name: "https://example.com/path" });
    await user.click(link);

    expect(openLink).toHaveBeenCalledWith("https://example.com/path");
    expect(link).toHaveAttribute("href", "https://example.com/path");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("calls onReplyToMessage from the explicit reply action", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const message = supportMessage({ senderRole: "user" });
    const onReplyToMessage = vi.fn();
    render(
      <ChatView
        variant="doctor"
        messages={[message]}
        composer={null}
        onReplyToMessage={onReplyToMessage}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ответить" }));
    expect(onReplyToMessage).toHaveBeenCalledWith(message);
  });
});
