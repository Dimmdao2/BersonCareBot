/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PatientHomeMailingsSection } from "./PatientHomeMailingsSection";

describe("PatientHomeMailingsSection", () => {
  it("hides a mailing after clicking viewed", async () => {
    const user = userEvent.setup();
    render(
      <PatientHomeMailingsSection
        userId="u-1"
        items={[
          { id: "m-1", label: "Рассылка 1", sentAt: "2026-04-29T00:00:00.000Z", status: "sent" },
          { id: "m-2", label: "Рассылка 2", sentAt: "2026-04-29T00:01:00.000Z", status: "sent" },
        ]}
      />,
    );
    expect(screen.getByText("Рассылка 1")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Просмотрено/i })[0]!);
    expect(screen.queryByText("Рассылка 1")).toBeNull();
    expect(screen.getByText("Рассылка 2")).toBeInTheDocument();
  });
});
