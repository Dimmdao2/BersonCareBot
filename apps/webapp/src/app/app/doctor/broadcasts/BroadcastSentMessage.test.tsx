/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BroadcastSentMessage } from "./BroadcastSentMessage";
import type { BroadcastPreviewResult } from "@/modules/doctor-broadcasts/ports";

describe("BroadcastSentMessage", () => {
  it("renders success copy and audience size", () => {
    const preview: BroadcastPreviewResult = {
      audienceSize: 7,
      category: "reminder",
      audienceFilter: "all",
    };
    render(<BroadcastSentMessage preview={preview} />);
    expect(screen.getByText(/рассылка запущена/i)).toBeInTheDocument();
    expect(screen.getByText(/7 получателей/i)).toBeInTheDocument();
    expect(document.getElementById("broadcast-sent-message")).toBeInTheDocument();
  });
});
