/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BroadcastConfirmStep } from "./BroadcastConfirmStep";
import type { BroadcastCommand, BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";

const preview: BroadcastPreviewResult = {
  audienceSize: 42,
  category: "reminder",
  audienceFilter: "with_telegram",
  channels: ["bot_message", "sms"],
};

const command: Omit<BroadcastCommand, "actorId"> = {
  category: "reminder",
  audienceFilter: "with_telegram",
  message: { title: "Заголовок теста", body: "Текст тела сообщения" },
};

describe("BroadcastConfirmStep", () => {
  it("shows audience size from preview", () => {
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(document.getElementById("broadcast-channels-summary")).toHaveTextContent(/сообщение в боте/i);
    expect(document.getElementById("broadcast-channels-summary")).toHaveTextContent(/sms/i);
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /отправить/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onCancel when back button is clicked", async () => {
    const onCancel = vi.fn();
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={onCancel}
        isLoading={false}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /назад/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("disables both buttons when isLoading is true", () => {
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={true}
      />
    );
    expect(screen.getByRole("button", { name: /отправка/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /назад/i })).toBeDisabled();
  });

  it("shows estimate warning for inactive audience segment", () => {
    const inactiveCommand: Omit<BroadcastCommand, "actorId"> = {
      ...command,
      audienceFilter: "inactive",
    };
    render(
      <BroadcastConfirmStep
        preview={{ ...preview, audienceFilter: "inactive" }}
        command={inactiveCommand}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    expect(document.getElementById("broadcast-preview-estimate-warning")).toBeInTheDocument();
    expect(screen.getByText(/грубая оценка/i)).toBeInTheDocument();
  });

  it("does not show estimate warning for with_telegram", () => {
    render(
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    expect(document.getElementById("broadcast-preview-estimate-warning")).not.toBeInTheDocument();
  });
});
