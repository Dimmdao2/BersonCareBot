/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
  });
});
