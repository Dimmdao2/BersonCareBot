/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { DoctorProgramDiscussionMessagesPanel } from "./DoctorProgramDiscussionMessagesPanel";

const itemA = "22222222-2222-4222-8222-222222222222";

function message(id: string, body: string, stageItemId = itemA): ProgramItemDiscussionMessage {
  return {
    id,
    instanceStageItemId: stageItemId,
    patientUserId: "00000000-0000-4000-8000-000000000001",
    senderRole: "patient",
    origin: "patient_observation",
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
});
