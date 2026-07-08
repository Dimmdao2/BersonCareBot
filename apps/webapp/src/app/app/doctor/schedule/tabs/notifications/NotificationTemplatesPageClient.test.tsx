/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NotificationTemplatesPageClient } from "./NotificationTemplatesPageClient";

const templates = [
  { event: "created" as const, audience: "patient" as const, text: "Пациент: ", isDefault: true },
  { event: "cancelled" as const, audience: "patient" as const, text: "Отмена", isDefault: true },
  { event: "rescheduled" as const, audience: "patient" as const, text: "Перенос", isDefault: true },
  { event: "created" as const, audience: "doctor" as const, text: "Врач: ", isDefault: true },
  { event: "cancelled" as const, audience: "doctor" as const, text: "Отмена врачу", isDefault: true },
  { event: "rescheduled" as const, audience: "doctor" as const, text: "Перенос врачу", isDefault: true },
];

describe("NotificationTemplatesPageClient", () => {
  it("groups templates by audience and inserts variable tokens from human-readable buttons", () => {
    render(<NotificationTemplatesPageClient templates={templates} variables={["date", "phone"]} />);

    const patientSection = screen.getByRole("region", { name: "Уведомления клиенту" });
    const doctorSection = screen.getByRole("region", { name: "Уведомления специалисту" });

    expect(within(patientSection).getAllByRole("textbox")).toHaveLength(3);
    expect(within(doctorSection).getAllByRole("textbox")).toHaveLength(3);
    expect(within(patientSection).getAllByRole("button", { name: "дата и время" })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "{{date}}" })).not.toBeInTheDocument();

    const patientCreatedText = within(patientSection).getByLabelText(
      "Подтверждение записи → пациенту",
    ) as HTMLTextAreaElement;
    patientCreatedText.focus();
    patientCreatedText.setSelectionRange("Пациент: ".length, "Пациент: ".length);

    fireEvent.click(within(patientSection).getAllByRole("button", { name: "дата и время" })[0]);

    expect(patientCreatedText).toHaveValue("Пациент: {{date}}");
  });
});
