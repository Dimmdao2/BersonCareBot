/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BroadcastSentMessage } from "./BroadcastSentMessage";
import type { BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";
import { deriveBroadcastDeliveryPolicy } from "@/modules/doctor-broadcasts/broadcastEligible";

describe("BroadcastSentMessage", () => {
  it("renders success copy and audience size", () => {
    const pol = deriveBroadcastDeliveryPolicy("all", ["bot_message", "sms"]);
    const preview: BroadcastPreviewResult = {
      audienceSize: 7,
      category: "reminder",
      audienceFilter: "all",
      channels: ["bot_message", "sms"],
      deliveryPolicyKind: pol.kind,
      deliveryPolicyDescriptionRu: pol.descriptionRu,
      recipientsPreview: { names: ["A", "B"], total: 7, truncated: true },
    };
    render(<BroadcastSentMessage preview={preview} />);
    expect(screen.getByText(/рассылка запущена/i)).toBeInTheDocument();
    expect(screen.getByText(/счётчики «доставлено»/i)).toBeInTheDocument();
    expect(screen.getByText(/получателей \(доставка\): 7/i)).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText(/каналы/i)).toBeInTheDocument();
    expect(document.getElementById("broadcast-sent-message")).toBeInTheDocument();
  });
});
