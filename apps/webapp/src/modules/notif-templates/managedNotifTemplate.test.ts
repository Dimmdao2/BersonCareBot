import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANAGED_NOTIF_PRESENTATION,
  ManagedNotifTemplateValidationError,
  SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
  createDefaultManagedNotifTemplate,
  renderManagedNotifTemplate,
  validateManagedNotifTemplateChannels,
} from "./managedNotifTemplate";

describe("managed notification template contract", () => {
  it("rejects unknown, clinical/free-text variables and absolute URLs", () => {
    const base = createDefaultManagedNotifTemplate("created", "patient").channels;
    expect(() => validateManagedNotifTemplateChannels("created", "patient", {
      ...base,
      email: { ...base.email, plainText: "Диагноз: {{diagnosis}}" },
    })).toThrow(ManagedNotifTemplateValidationError);
    expect(() => validateManagedNotifTemplateChannels("cancelled", "patient", {
      ...base,
      email: { ...base.email, plainText: "Причина: {{reason}}" },
    })).toThrow(ManagedNotifTemplateValidationError);
    expect(() => validateManagedNotifTemplateChannels("created", "patient", {
      ...base,
      email: { ...base.email, plainText: "Открыть https://untrusted.example/path" },
    })).toThrow(ManagedNotifTemplateValidationError);
    expect(() => validateManagedNotifTemplateChannels("created", "patient", {
      ...base,
      email: { ...base.email, subject: "Тема\nBcc: hidden@example.test" },
    })).toThrow(ManagedNotifTemplateValidationError);
  });

  it("allows name and masked phone only for the specialist audience", () => {
    const doctor = createDefaultManagedNotifTemplate("created", "doctor").channels;
    expect(validateManagedNotifTemplateChannels("created", "doctor", doctor).email.plainText)
      .toContain("{{phone}}");
    expect(() => validateManagedNotifTemplateChannels("created", "patient", doctor))
      .toThrow(ManagedNotifTemplateValidationError);
  });

  it("renders escaped server-owned email HTML plus mandatory plain text", () => {
    const rendered = renderManagedNotifTemplate({
      event: "created",
      audience: "patient",
      channel: "email",
      template: createDefaultManagedNotifTemplate("created", "patient"),
      presentation: {
        ...DEFAULT_MANAGED_NOTIF_PRESENTATION,
        layout: "organization",
        signature: "Команда <Клиники>",
        contacts: "Телефон поддержки",
      },
      variables: { ...SYNTHETIC_NOTIF_TEMPLATE_VARIABLES, organizationName: "Клиника <Добро>" },
      brandingEnabled: true,
    });
    expect(rendered.channel).toBe("email");
    if (rendered.channel !== "email") throw new Error("email_render_expected");
    expect(rendered.plainText).toContain("Команда <Клиники>");
    expect(rendered.html).toContain("Клиника &lt;Добро&gt;");
    expect(rendered.html).toContain("Команда &lt;Клиники&gt;");
    expect(rendered.html).not.toContain("<Клиники>");
  });

  it("uses deterministic neutral wrapper when branding is unavailable", () => {
    const rendered = renderManagedNotifTemplate({
      event: "created",
      audience: "patient",
      channel: "email",
      template: createDefaultManagedNotifTemplate("created", "patient"),
      presentation: {
        ...DEFAULT_MANAGED_NOTIF_PRESENTATION,
        layout: "organization",
        signature: "Платная подпись",
        contacts: "Платные контакты",
      },
      variables: SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
      brandingEnabled: false,
    });
    if (rendered.channel !== "email") throw new Error("email_render_expected");
    expect(rendered.plainText).not.toContain("Платная подпись");
    expect(rendered.html).toContain("Название клиники");
  });
});
