/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NotificationTemplatesPageClient } from "./NotificationTemplatesPageClient";
import {
  DEFAULT_MANAGED_NOTIF_PRESENTATION,
  createDefaultManagedNotifTemplate,
  type ManagedNotifTemplateEntry,
} from "@/modules/notif-templates/managedNotifTemplate";
import {
  NOTIF_TEMPLATE_AUDIENCES,
  NOTIF_TEMPLATE_DEFAULTS,
  NOTIF_TEMPLATE_EVENTS,
} from "@/modules/notif-templates/notifTemplatesService";

const templates: ManagedNotifTemplateEntry[] = NOTIF_TEMPLATE_EVENTS.flatMap((event) =>
  NOTIF_TEMPLATE_AUDIENCES.map((audience) => ({
    event,
    audience,
    legacyText: NOTIF_TEMPLATE_DEFAULTS[event][audience],
    legacyIsDefault: true,
    managed: createDefaultManagedNotifTemplate(event, audience),
    metadata: { revision: 0, effectiveSource: "hardcoded" as const, updatedAt: null, updatedBy: null },
  })),
);

describe("NotificationTemplatesPageClient", () => {
  it("groups templates by audience and exposes per-channel safe variable buttons", () => {
    render(
      <NotificationTemplatesPageClient
        endpoint="/api/doctor/notification-templates"
        templates={templates}
        presentation={{
          presentation: DEFAULT_MANAGED_NOTIF_PRESENTATION,
          metadata: { revision: 0, effectiveSource: "hardcoded", updatedAt: null, updatedBy: null },
        }}
      />,
    );

    const patientSection = screen.getByRole("region", { name: "Уведомления клиенту" });
    const doctorSection = screen.getByRole("region", { name: "Уведомления специалисту" });
    expect(within(patientSection).getAllByRole("textbox")).toHaveLength(6);
    expect(within(doctorSection).getAllByRole("textbox")).toHaveLength(6);
    expect(within(patientSection).queryByRole("button", { name: "телефон" })).not.toBeInTheDocument();
    expect(within(doctorSection).getAllByRole("button", { name: "телефон" }).length).toBeGreaterThan(0);

    const patientCreatedText = within(patientSection).getByLabelText(
      "Подтверждение записи → пациенту — Текст письма",
    ) as HTMLTextAreaElement;
    patientCreatedText.focus();
    patientCreatedText.setSelectionRange(patientCreatedText.value.length, patientCreatedText.value.length);
    fireEvent.click(within(patientSection).getAllByRole("button", { name: "дата и время" })[1]!);
    expect(patientCreatedText.value).toContain("{{date}}");
  });
});
