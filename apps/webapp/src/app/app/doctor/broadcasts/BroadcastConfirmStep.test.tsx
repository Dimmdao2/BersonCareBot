/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BroadcastConfirmStep } from "./BroadcastConfirmStep";
import type { BroadcastCommand, BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
import { deriveBroadcastDeliveryPolicy } from "@/modules/doctor-broadcasts/broadcastEligible";

const policy = deriveBroadcastDeliveryPolicy("with_telegram", ["bot_message", "sms"]);

const preview: BroadcastPreviewResult = {
  audienceSize: 42,
  category: "reminder",
  audienceFilter: "with_telegram",
  channels: ["bot_message", "sms"],
  deliveryPolicyKind: policy.kind,
  deliveryPolicyDescriptionRu: policy.descriptionRu,
  recipientsPreview: {
    names: ["Иван Т.", "Мария К."],
    total: 42,
    truncated: true,
  },
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
    expect(screen.getByText("Иван Т.")).toBeInTheDocument();
    expect(screen.getByText("Мария К.")).toBeInTheDocument();
    expect(document.getElementById("broadcast-recipients-preview-truncated")).toBeInTheDocument();
    expect(document.getElementById("broadcast-channels-summary")).toHaveTextContent(/сообщение в боте/i);
    expect(document.getElementById("broadcast-channels-summary")).toHaveTextContent(/sms/i);
    expect(document.getElementById("broadcast-delivery-policy")).toHaveTextContent(policy.descriptionRu);
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
    expect(document.getElementById("broadcast-recipients-preview")).not.toBeInTheDocument();
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

  it("shows empty recipients note when preview total is zero", () => {
    render(
      <BroadcastConfirmStep
        preview={{
          ...preview,
          audienceSize: 0,
          recipientsPreview: { names: [], total: 0, truncated: false },
        }}
        command={command}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    expect(document.getElementById("broadcast-recipients-preview-empty")).toBeInTheDocument();
  });

  it("shows dev_mode reach note when segmentSize exceeds audienceSize", () => {
    render(
      <BroadcastConfirmStep
        preview={{ ...preview, audienceSize: 1, segmentSize: 75 }}
        command={{ ...command, audienceFilter: "all" }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        isLoading={false}
      />
    );
    expect(document.getElementById("broadcast-dev-mode-reach-note")).toBeInTheDocument();
    expect(screen.getByText(/dev_mode/i)).toBeInTheDocument();
  });
});
