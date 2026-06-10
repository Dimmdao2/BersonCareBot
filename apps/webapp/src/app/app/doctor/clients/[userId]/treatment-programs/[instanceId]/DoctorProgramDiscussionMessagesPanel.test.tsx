/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { DoctorProgramDiscussionMessagesPanel } from "./DoctorProgramDiscussionMessagesPanel";

const itemA = "22222222-2222-4222-8222-222222222222";

function message(
  id: string,
  body: string,
  stageItemId = itemA,
  senderRole: ProgramItemDiscussionMessage["senderRole"] = "patient",
): ProgramItemDiscussionMessage {
  return {
    id,
    instanceStageItemId: stageItemId,
    patientUserId: "00000000-0000-4000-8000-000000000001",
    senderRole,
    origin: senderRole === "patient" ? "patient_observation" : "support_admin_reply",
    body,
    mediaFileId: null,
    supportMessageId: null,
    createdAt: "2026-06-01T10:00:00.000Z",
  };
}

describe("DoctorProgramDiscussionMessagesPanel", () => {
  it("renders item labels in all-items mode and calls onLoadOlder", async () => {
    const onLoadOlder = vi.fn();
    const user = userEvent.setup();
    const itemLabelById = new Map([[itemA, "Приседания"]]);

    render(
      <DoctorProgramDiscussionMessagesPanel
        messages={[message("m1", "Текст")]}
        loading={false}
        loadingOlder={false}
        error={null}
        nextCursor="cursor-1"
        onLoadOlder={onLoadOlder}
        itemLabelById={itemLabelById}
      />,
    );

    expect(screen.getByText("Приседания")).toBeInTheDocument();
    expect(screen.getByText("Текст")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /показать предыдущие/i }));
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("opens inline reply composer and sends doctor reply", async () => {
    const user = userEvent.setup();
    const onSendReply = vi.fn(async () => ({ ok: true as const }));
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      media: "(hover: none), (pointer: coarse)",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    }));

    render(
      <DoctorProgramDiscussionMessagesPanel
        messages={[message("m1", "Пациент пишет")]}
        loading={false}
        loadingOlder={false}
        error={null}
        nextCursor={null}
        onLoadOlder={() => {}}
        onSendReply={onSendReply}
      />,
    );

    await user.click(screen.getByText("Пациент пишет"));
    await user.click(screen.getByRole("button", { name: /ответить/i }));
    await user.type(screen.getByPlaceholderText(/введите ответ пациенту/i), "Ответ врача");
    await user.click(screen.getByRole("button", { name: /отправить ответ/i }));

    expect(onSendReply).toHaveBeenCalledWith(itemA, "Ответ врача");
  });

  it("deletes patient media message after confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      media: "(hover: none), (pointer: coarse)",
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    }));
    const onDeleteMediaMessage = vi.fn(async () => ({ ok: true as const }));
    const mediaMessage: ProgramItemDiscussionMessage = {
      ...message("m-media", "", itemA, "patient"),
      mediaFileId: "33333333-3333-4333-8333-333333333333",
      body: null,
    };

    render(
      <DoctorProgramDiscussionMessagesPanel
        messages={[mediaMessage]}
        loading={false}
        loadingOlder={false}
        error={null}
        nextCursor={null}
        onLoadOlder={() => {}}
        onDeleteMediaMessage={onDeleteMediaMessage}
      />,
    );

    await user.click(screen.getByRole("button", { name: /удалить файл из чата/i }));
    expect(screen.getByText(/удалить файл из чата\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^удалить$/i }));
    expect(onDeleteMediaMessage).toHaveBeenCalledWith("m-media");
  });

  it("shows read delivery tick on doctor outgoing when patient read cursor covers message", () => {
    render(
      <DoctorProgramDiscussionMessagesPanel
        messages={[message("m-admin", "Ответ врача", itemA, "admin")]}
        loading={false}
        loadingOlder={false}
        error={null}
        nextCursor={null}
        onLoadOlder={() => {}}
        peerLastReadAt="2026-06-01T12:00:00.000Z"
      />,
    );
    expect(screen.getByText("Ответ врача")).toBeInTheDocument();
    expect(document.querySelector('[data-delivery-status="read"]')).toBeInTheDocument();
  });
});
