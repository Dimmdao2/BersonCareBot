import type { NotifTemplateAudience, NotifTemplateEvent } from "./notifTemplatesService";

export const NOTIF_TEMPLATE_CHANNELS = ["email", "telegram", "max", "smsc", "web_push"] as const;
export type NotifTemplateChannel = (typeof NOTIF_TEMPLATE_CHANNELS)[number];

export const MANAGED_NOTIF_TEMPLATE_VERSION = 1 as const;
export const MANAGED_NOTIF_TEMPLATE_MAX_SUBJECT_LENGTH = 180;
export const MANAGED_NOTIF_TEMPLATE_MAX_TITLE_LENGTH = 120;
export const MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH = 2_000;

export type ManagedNotifTemplateChannels = Readonly<{
  email: Readonly<{ subject: string; plainText: string }>;
  telegram: Readonly<{ text: string }>;
  max: Readonly<{ text: string }>;
  smsc: Readonly<{ text: string }>;
  web_push: Readonly<{ title: string; text: string }>;
}>;

export type ManagedNotifTemplate = Readonly<{
  version: typeof MANAGED_NOTIF_TEMPLATE_VERSION;
  revision: number;
  channels: ManagedNotifTemplateChannels;
}>;

export const NOTIF_EMAIL_LAYOUTS = ["neutral", "organization"] as const;
export type NotifEmailLayout = (typeof NOTIF_EMAIL_LAYOUTS)[number];

/**
 * A single presentation profile is carried by the existing `created:patient` setting.
 * Asset ids stay dormant until the branding domain exposes a canonical published-asset resolver.
 */
export type ManagedNotifPresentation = Readonly<{
  version: typeof MANAGED_NOTIF_TEMPLATE_VERSION;
  revision: number;
  layout: NotifEmailLayout;
  signature: string;
  contacts: string;
  logoAssetId: null;
  avatarAssetId: null;
}>;

export type ManagedNotifEffectiveSource = "hardcoded" | "platform" | "organization";

export type ManagedNotifTemplateMetadata = Readonly<{
  revision: number;
  effectiveSource: ManagedNotifEffectiveSource;
  updatedAt: string | null;
  updatedBy: string | null;
}>;

export type ManagedNotifTemplateEntry = Readonly<{
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  legacyText: string;
  legacyIsDefault: boolean;
  managed: ManagedNotifTemplate;
  metadata: ManagedNotifTemplateMetadata;
}>;

export type ManagedNotifPresentationEntry = Readonly<{
  presentation: ManagedNotifPresentation;
  metadata: ManagedNotifTemplateMetadata;
}>;

export const SYNTHETIC_NOTIF_TEMPLATE_VARIABLES = Object.freeze({
  date: "25 июля, 14:00",
  type: "Консультация",
  city: "Москва",
  name: "Анна Петрова",
  phone: "+7 ••• •••-12-34",
  organizationName: "Название клиники",
});

type AllowedVariable = keyof typeof SYNTHETIC_NOTIF_TEMPLATE_VARIABLES;

const BASE_PATIENT_VARIABLES = ["date", "type", "city", "organizationName"] as const;
const BASE_DOCTOR_VARIABLES = ["date", "type", "city", "organizationName", "name", "phone"] as const;

/** Server-owned allowlist; `reason` and arbitrary free-text variables are intentionally absent. */
export function allowedNotifTemplateVariables(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  channel: NotifTemplateChannel,
): readonly AllowedVariable[] {
  const base = audience === "doctor" ? BASE_DOCTOR_VARIABLES : BASE_PATIENT_VARIABLES;
  if (event === "cancelled") {
    return base.filter((variable) => variable !== "type" && variable !== "city");
  }
  if (channel === "web_push") {
    return base.filter((variable) => variable !== "phone");
  }
  return base;
}

const TOKEN_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;
const ABSOLUTE_URL_PATTERN = /(?:https?:\/\/|\/\/)[^\s]+/i;

export class ManagedNotifTemplateValidationError extends Error {
  readonly reason: "empty" | "too_long" | "unknown_variable" | "unsafe_url" | "invalid_shape";

  constructor(reason: ManagedNotifTemplateValidationError["reason"], message: string) {
    super(message);
    this.name = "ManagedNotifTemplateValidationError";
    this.reason = reason;
  }
}

function validateContent(
  value: string,
  allowedVariables: readonly AllowedVariable[],
  maxLength: number,
): string {
  const normalized = value.trim();
  if (!normalized) throw new ManagedNotifTemplateValidationError("empty", "template_content_empty");
  if (normalized.length > maxLength) {
    throw new ManagedNotifTemplateValidationError("too_long", "template_content_too_long");
  }
  if (ABSOLUTE_URL_PATTERN.test(normalized)) {
    throw new ManagedNotifTemplateValidationError("unsafe_url", "template_absolute_url_forbidden");
  }
  const allowed = new Set<string>(allowedVariables);
  for (const match of normalized.matchAll(TOKEN_PATTERN)) {
    const variable = match[1];
    if (!variable || !allowed.has(variable)) {
      throw new ManagedNotifTemplateValidationError("unknown_variable", "template_variable_forbidden");
    }
  }
  if (normalized.includes("{{") || normalized.includes("}}")) {
    const withoutKnownTokens = normalized.replace(TOKEN_PATTERN, "");
    if (withoutKnownTokens.includes("{{") || withoutKnownTokens.includes("}}")) {
      throw new ManagedNotifTemplateValidationError("unknown_variable", "template_variable_malformed");
    }
  }
  return normalized;
}

function validateEmailSubject(value: string, allowedVariables: readonly AllowedVariable[]): string {
  const subject = validateContent(value, allowedVariables, MANAGED_NOTIF_TEMPLATE_MAX_SUBJECT_LENGTH);
  if (subject.includes("\r") || subject.includes("\n")) {
    throw new ManagedNotifTemplateValidationError("invalid_shape", "template_subject_newline_forbidden");
  }
  return subject;
}

export function validateManagedNotifTemplateChannels(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  channels: ManagedNotifTemplateChannels,
): ManagedNotifTemplateChannels {
  return {
    email: {
      subject: validateEmailSubject(
        channels.email.subject,
        allowedNotifTemplateVariables(event, audience, "email"),
      ),
      plainText: validateContent(
        channels.email.plainText,
        allowedNotifTemplateVariables(event, audience, "email"),
        MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH,
      ),
    },
    telegram: {
      text: validateContent(
        channels.telegram.text,
        allowedNotifTemplateVariables(event, audience, "telegram"),
        MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH,
      ),
    },
    max: {
      text: validateContent(
        channels.max.text,
        allowedNotifTemplateVariables(event, audience, "max"),
        MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH,
      ),
    },
    smsc: {
      text: validateContent(
        channels.smsc.text,
        allowedNotifTemplateVariables(event, audience, "smsc"),
        MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH,
      ),
    },
    web_push: {
      title: validateContent(
        channels.web_push.title,
        allowedNotifTemplateVariables(event, audience, "web_push"),
        MANAGED_NOTIF_TEMPLATE_MAX_TITLE_LENGTH,
      ),
      text: validateContent(
        channels.web_push.text,
        allowedNotifTemplateVariables(event, audience, "web_push"),
        MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH,
      ),
    },
  };
}

const EVENT_SUBJECTS: Record<NotifTemplateEvent, string> = {
  created: "Запись подтверждена",
  cancelled: "Запись отменена",
  rescheduled: "Запись перенесена",
};

function safeDefaultText(event: NotifTemplateEvent, audience: NotifTemplateAudience): string {
  if (event === "created") {
    return audience === "patient"
      ? "Запись подтверждена: {{date}}\n{{type}}, {{city}}"
      : "Новая запись: {{name}}, {{phone}}\nДата: {{date}}";
  }
  if (event === "cancelled") {
    return audience === "patient"
      ? "Запись на {{date}} отменена."
      : "Отмена записи: {{name}}\nДата: {{date}}";
  }
  return audience === "patient"
    ? "Запись перенесена на {{date}}\n{{type}}"
    : "Перенос записи: {{name}}, {{phone}}\nНовая дата: {{date}}";
}

function safeDefaultPushText(event: NotifTemplateEvent, audience: NotifTemplateAudience): string {
  if (audience === "patient") return safeDefaultText(event, audience);
  if (event === "created") return "Новая запись: {{name}}\nДата: {{date}}";
  if (event === "cancelled") return "Отмена записи: {{name}}\nДата: {{date}}";
  return "Перенос записи: {{name}}\nНовая дата: {{date}}";
}

export function createDefaultManagedNotifTemplate(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
): ManagedNotifTemplate {
  const text = safeDefaultText(event, audience);
  return {
    version: MANAGED_NOTIF_TEMPLATE_VERSION,
    revision: 0,
    channels: {
      email: { subject: EVENT_SUBJECTS[event], plainText: text },
      telegram: { text },
      max: { text },
      smsc: { text },
      web_push: { title: EVENT_SUBJECTS[event], text: safeDefaultPushText(event, audience) },
    },
  };
}

export const DEFAULT_MANAGED_NOTIF_PRESENTATION: ManagedNotifPresentation = Object.freeze({
  version: MANAGED_NOTIF_TEMPLATE_VERSION,
  revision: 0,
  layout: "neutral",
  signature: "",
  contacts: "",
  logoAssetId: null,
  avatarAssetId: null,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readStringField(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === "string" ? field : null;
}

export function parseManagedNotifTemplateFor(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  valueJson: unknown,
): ManagedNotifTemplate | null {
  if (!isRecord(valueJson) || !isRecord(valueJson.managed)) return null;
  const managed = valueJson.managed;
  if (managed.version !== MANAGED_NOTIF_TEMPLATE_VERSION || typeof managed.revision !== "number") return null;
  if (!Number.isSafeInteger(managed.revision) || managed.revision < 1 || !isRecord(managed.channels)) return null;
  const channels = managed.channels;
  const parsed: ManagedNotifTemplateChannels = {
    email: {
      subject: readStringField(channels.email, "subject") ?? "",
      plainText: readStringField(channels.email, "plainText") ?? "",
    },
    telegram: { text: readStringField(channels.telegram, "text") ?? "" },
    max: { text: readStringField(channels.max, "text") ?? "" },
    smsc: { text: readStringField(channels.smsc, "text") ?? "" },
    web_push: {
      title: readStringField(channels.web_push, "title") ?? "",
      text: readStringField(channels.web_push, "text") ?? "",
    },
  };
  try {
    return {
      version: MANAGED_NOTIF_TEMPLATE_VERSION,
      revision: managed.revision,
      channels: validateManagedNotifTemplateChannels(event, audience, parsed),
    };
  } catch {
    return null;
  }
}

export function parseManagedNotifPresentation(valueJson: unknown): ManagedNotifPresentation | null {
  if (!isRecord(valueJson) || !isRecord(valueJson.presentation)) return null;
  const presentation = valueJson.presentation;
  if (
    presentation.version !== MANAGED_NOTIF_TEMPLATE_VERSION ||
    typeof presentation.revision !== "number" ||
    !Number.isSafeInteger(presentation.revision) ||
    presentation.revision < 1 ||
    (presentation.layout !== "neutral" && presentation.layout !== "organization") ||
    typeof presentation.signature !== "string" ||
    typeof presentation.contacts !== "string" ||
    presentation.logoAssetId !== null ||
    presentation.avatarAssetId !== null
  ) return null;
  if (presentation.signature.length > 500 || presentation.contacts.length > 500) return null;
  if (ABSOLUTE_URL_PATTERN.test(presentation.signature) || ABSOLUTE_URL_PATTERN.test(presentation.contacts)) return null;
  return {
    version: MANAGED_NOTIF_TEMPLATE_VERSION,
    revision: presentation.revision,
    layout: presentation.layout,
    signature: presentation.signature.trim(),
    contacts: presentation.contacts.trim(),
    logoAssetId: null,
    avatarAssetId: null,
  };
}

function replaceVariables(
  template: string,
  values: Readonly<Partial<Record<AllowedVariable, string>>>,
  allowed: readonly AllowedVariable[],
): string {
  const allowedSet = new Set<string>(allowed);
  return template.replace(TOKEN_PATTERN, (_token, variable: string) => {
    if (!allowedSet.has(variable)) {
      throw new ManagedNotifTemplateValidationError("unknown_variable", "template_variable_forbidden");
    }
    const value = values[variable as AllowedVariable];
    if (typeof value !== "string" || ABSOLUTE_URL_PATTERN.test(value)) {
      throw new ManagedNotifTemplateValidationError("unsafe_url", "template_variable_value_forbidden");
    }
    return value;
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type RenderedManagedNotifTemplate =
  | Readonly<{ channel: "email"; subject: string; plainText: string; html: string }>
  | Readonly<{ channel: "telegram" | "max" | "smsc"; text: string }>
  | Readonly<{ channel: "web_push"; title: string; text: string }>;

export function renderManagedNotifTemplate(input: {
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  channel: NotifTemplateChannel;
  template: ManagedNotifTemplate;
  presentation: ManagedNotifPresentation;
  variables: Readonly<Partial<Record<AllowedVariable, string>>>;
  brandingEnabled: boolean;
}): RenderedManagedNotifTemplate {
  const validatedTemplate: ManagedNotifTemplate = {
    ...input.template,
    channels: validateManagedNotifTemplateChannels(input.event, input.audience, input.template.channels),
  };
  const allowed = allowedNotifTemplateVariables(input.event, input.audience, input.channel);
  if (input.channel === "email") {
    const subject = replaceVariables(validatedTemplate.channels.email.subject, input.variables, allowed);
    const plainBody = replaceVariables(validatedTemplate.channels.email.plainText, input.variables, allowed);
    const useBranding = input.brandingEnabled && input.presentation.layout === "organization";
    const signature = useBranding ? input.presentation.signature : "";
    const contacts = useBranding ? input.presentation.contacts : "";
    const plainText = [plainBody, signature, contacts].filter(Boolean).join("\n\n");
    const identity = input.variables.organizationName ?? "";
    if (ABSOLUTE_URL_PATTERN.test(identity)) {
      throw new ManagedNotifTemplateValidationError("unsafe_url", "template_identity_value_forbidden");
    }
    const header = identity ? `<div style="font-weight:600">${escapeHtml(identity)}</div>` : "";
    const footer = [signature, contacts]
      .filter(Boolean)
      .map((part) => `<div>${escapeHtml(part)}</div>`)
      .join("");
    const html = [
      '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5">',
      header,
      `<div>${escapeHtml(plainBody).replaceAll("\n", "<br>")}</div>`,
      footer ? `<div style="margin-top:24px;color:#6b7280">${footer}</div>` : "",
      "</div>",
    ].join("");
    return { channel: "email", subject, plainText, html };
  }
  if (input.channel === "web_push") {
    return {
      channel: "web_push",
      title: replaceVariables(validatedTemplate.channels.web_push.title, input.variables, allowed),
      text: replaceVariables(validatedTemplate.channels.web_push.text, input.variables, allowed),
    };
  }
  const text = input.channel === "telegram"
    ? validatedTemplate.channels.telegram.text
    : input.channel === "max"
      ? validatedTemplate.channels.max.text
      : validatedTemplate.channels.smsc.text;
  return {
    channel: input.channel,
    text: replaceVariables(text, input.variables, allowed),
  };
}
