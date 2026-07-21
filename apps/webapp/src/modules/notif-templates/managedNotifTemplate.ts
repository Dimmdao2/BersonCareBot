import type { NotifTemplateAudience, NotifTemplateEvent } from "./notifTemplatesService";

export const NOTIF_TEMPLATE_CHANNELS = ["email", "telegram", "max", "smsc", "web_push"] as const;
export type NotifTemplateChannel = (typeof NOTIF_TEMPLATE_CHANNELS)[number];

export const MANAGED_NOTIF_TEMPLATE_VERSION = 1 as const;
export const MANAGED_NOTIF_TEMPLATE_MAX_SUBJECT_LENGTH = 180;
export const MANAGED_NOTIF_TEMPLATE_MAX_TITLE_LENGTH = 120;
export const MANAGED_NOTIF_TEMPLATE_MAX_TEXT_LENGTH = 2_000;
export const MANAGED_NOTIF_RENDER_LIMITS = Object.freeze({
  emailSubject: 180,
  emailPlainText: 6_000,
  telegramText: 4_096,
  maxText: 4_000,
  smscText: 480,
  webPushTitle: 120,
  webPushText: 240,
});

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

export type ManagedNotifEffectiveSource = "hardcoded" | "legacy" | "platform" | "organization";

export type ManagedNotifTemplateMetadata = Readonly<{
  revision: number;
  effectiveSource: ManagedNotifEffectiveSource;
  updatedAt: string | null;
  updatedBy: string | null;
  /** Exact target-row token used for compare-and-swap writes; null means the row does not exist yet. */
  writeToken: string | null;
}>;

export type ManagedNotifLegacyCompatibility = Readonly<{
  status: "compatible" | "incompatible";
  preservedText: string;
  forbiddenVariables: readonly string[];
}>;

export type ManagedNotifTemplateEntry = Readonly<{
  event: NotifTemplateEvent;
  audience: NotifTemplateAudience;
  legacyText: string;
  legacyIsDefault: boolean;
  legacyCompatibility: ManagedNotifLegacyCompatibility;
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

const BOOKING_DETAIL_VARIABLES = ["date", "type", "city", "organizationName"] as const;
const BOOKING_CANCELLED_VARIABLES = ["date", "organizationName"] as const;
const DEIDENTIFIED_EXTERNAL_VARIABLES = ["date", "organizationName"] as const;

type ManagedNotifTemplatePolicy = Readonly<{
  tier: "T1_transactional";
  variables: readonly AllowedVariable[];
}>;

function eventPolicy(
  bookingVariables: readonly AllowedVariable[],
): Record<NotifTemplateAudience, Record<NotifTemplateChannel, ManagedNotifTemplatePolicy>> {
  const external = { tier: "T1_transactional", variables: DEIDENTIFIED_EXTERNAL_VARIABLES } as const;
  const email = { tier: "T1_transactional", variables: bookingVariables } as const;
  const push = { tier: "T1_transactional", variables: bookingVariables } as const;
  return {
    patient: { email, telegram: external, max: external, smsc: external, web_push: push },
    doctor: { email, telegram: external, max: external, smsc: external, web_push: push },
  };
}

/**
 * Exact N1B booking-lifecycle matrix. No row allows patient name, phone, free text or reason.
 * Telegram/MAX/SMS remain deidentified even though N1 prevents their product adoption.
 */
export const MANAGED_NOTIF_TEMPLATE_POLICY: Record<
  NotifTemplateEvent,
  Record<NotifTemplateAudience, Record<NotifTemplateChannel, ManagedNotifTemplatePolicy>>
> = {
  created: eventPolicy(BOOKING_DETAIL_VARIABLES),
  cancelled: eventPolicy(BOOKING_CANCELLED_VARIABLES),
  rescheduled: eventPolicy(BOOKING_DETAIL_VARIABLES),
};

export function allowedNotifTemplateVariables(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  channel: NotifTemplateChannel,
): readonly AllowedVariable[] {
  return MANAGED_NOTIF_TEMPLATE_POLICY[event][audience][channel].variables;
}

const TOKEN_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g;
const ABSOLUTE_URL_PATTERN = /(?:https?:\/\/|\/\/)[^\s]+/i;

export class ManagedNotifTemplateValidationError extends Error {
  readonly reason: "empty" | "too_long" | "unknown_variable" | "unsafe_url" | "invalid_shape" | "unsafe_value";

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

const UNSAFE_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const LINE_BREAK_PATTERN = /[\r\n]/;

function validateRenderedText(value: string, maxLength: number, singleLine = false): string {
  if (value.length > maxLength) {
    throw new ManagedNotifTemplateValidationError("too_long", "template_rendered_content_too_long");
  }
  if (UNSAFE_CONTROL_PATTERN.test(value) || (singleLine && LINE_BREAK_PATTERN.test(value))) {
    throw new ManagedNotifTemplateValidationError("unsafe_value", "template_rendered_control_character_forbidden");
  }
  return value;
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
        MANAGED_NOTIF_RENDER_LIMITS.smscText,
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
        MANAGED_NOTIF_RENDER_LIMITS.webPushText,
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
      : "Появилась новая запись.\nДата: {{date}}\n{{type}}, {{city}}";
  }
  if (event === "cancelled") {
    return audience === "patient"
      ? "Запись на {{date}} отменена."
      : "Запись отменена.\nДата: {{date}}";
  }
  return audience === "patient"
    ? "Запись перенесена на {{date}}\n{{type}}"
    : "Запись перенесена.\nНовая дата: {{date}}\n{{type}}, {{city}}";
}

function safeDefaultExternalText(event: NotifTemplateEvent): string {
  if (event === "created") return "Запись подтверждена: {{date}}";
  if (event === "cancelled") return "Запись отменена: {{date}}";
  return "Запись перенесена: {{date}}";
}

export function createDefaultManagedNotifTemplate(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
): ManagedNotifTemplate {
  const text = safeDefaultText(event, audience);
  const externalText = safeDefaultExternalText(event);
  return {
    version: MANAGED_NOTIF_TEMPLATE_VERSION,
    revision: 0,
    channels: {
      email: { subject: EVENT_SUBJECTS[event], plainText: text },
      telegram: { text: externalText },
      max: { text: externalText },
      smsc: { text: externalText },
      web_push: { title: EVENT_SUBJECTS[event], text },
    },
  };
}

function tokenNames(value: string): { names: string[]; malformed: boolean } {
  const names = [...value.matchAll(TOKEN_PATTERN)].map((match) => match[1]).filter((name): name is string => Boolean(name));
  const withoutTokens = value.replace(TOKEN_PATTERN, "");
  return { names, malformed: withoutTokens.includes("{{") || withoutTokens.includes("}}") };
}

/**
 * One-time read adapter for the existing `{ value }` carrier. Compatible legacy copy is surfaced in every
 * channel whose exact policy accepts its tokens; stricter channels retain their safe defaults. Unsafe legacy
 * text stays in the same carrier and is returned as an explicit warning instead of being silently discarded.
 */
export function adaptLegacyNotifTemplate(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  legacyText: string,
): { template: ManagedNotifTemplate; compatibility: ManagedNotifLegacyCompatibility } {
  const preservedText = legacyText.trim();
  const defaults = createDefaultManagedNotifTemplate(event, audience);
  const parsed = tokenNames(preservedText);
  const allowedAcrossPolicy = new Set(
    NOTIF_TEMPLATE_CHANNELS.flatMap((channel) => allowedNotifTemplateVariables(event, audience, channel)),
  );
  const forbiddenVariables = [...new Set(parsed.names.filter((name) => !allowedAcrossPolicy.has(name as AllowedVariable)))];
  if (!preservedText || parsed.malformed || ABSOLUTE_URL_PATTERN.test(preservedText) || forbiddenVariables.length > 0) {
    return {
      template: defaults,
      compatibility: {
        status: "incompatible",
        preservedText,
        forbiddenVariables: parsed.malformed
          ? [...forbiddenVariables, "malformed_token"]
          : ABSOLUTE_URL_PATTERN.test(preservedText)
            ? [...forbiddenVariables, "unsafe_url"]
            : forbiddenVariables,
      },
    };
  }

  function textFor(channel: NotifTemplateChannel, fallback: string): string {
    const allowed = new Set(allowedNotifTemplateVariables(event, audience, channel));
    return parsed.names.every((name) => allowed.has(name as AllowedVariable)) ? preservedText : fallback;
  }

  const channels: ManagedNotifTemplateChannels = {
    email: { ...defaults.channels.email, plainText: textFor("email", defaults.channels.email.plainText) },
    telegram: { text: textFor("telegram", defaults.channels.telegram.text) },
    max: { text: textFor("max", defaults.channels.max.text) },
    smsc: { text: textFor("smsc", defaults.channels.smsc.text) },
    web_push: { ...defaults.channels.web_push, text: textFor("web_push", defaults.channels.web_push.text) },
  };
  try {
    return {
      template: { ...defaults, channels: validateManagedNotifTemplateChannels(event, audience, channels) },
      compatibility: { status: "compatible", preservedText, forbiddenVariables: [] },
    };
  } catch {
    return {
      template: defaults,
      compatibility: { status: "incompatible", preservedText, forbiddenVariables: ["unsafe_length"] },
    };
  }
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
    if (typeof value !== "string") {
      throw new ManagedNotifTemplateValidationError("unsafe_value", "template_variable_value_missing");
    }
    if (ABSOLUTE_URL_PATTERN.test(value)) {
      throw new ManagedNotifTemplateValidationError("unsafe_url", "template_variable_value_forbidden");
    }
    if (UNSAFE_CONTROL_PATTERN.test(value) || LINE_BREAK_PATTERN.test(value)) {
      throw new ManagedNotifTemplateValidationError("unsafe_value", "template_variable_control_character_forbidden");
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
    const subject = validateRenderedText(
      replaceVariables(validatedTemplate.channels.email.subject, input.variables, allowed),
      MANAGED_NOTIF_RENDER_LIMITS.emailSubject,
      true,
    );
    const plainBody = replaceVariables(validatedTemplate.channels.email.plainText, input.variables, allowed);
    const useBranding = input.brandingEnabled && input.presentation.layout === "organization";
    const signature = useBranding ? input.presentation.signature : "";
    const contacts = useBranding ? input.presentation.contacts : "";
    const plainText = validateRenderedText(
      [plainBody, signature, contacts].filter(Boolean).join("\n\n"),
      MANAGED_NOTIF_RENDER_LIMITS.emailPlainText,
    );
    const identity = validateRenderedText(input.variables.organizationName ?? "", 200, true);
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
      title: validateRenderedText(
        replaceVariables(validatedTemplate.channels.web_push.title, input.variables, allowed),
        MANAGED_NOTIF_RENDER_LIMITS.webPushTitle,
        true,
      ),
      text: validateRenderedText(
        replaceVariables(validatedTemplate.channels.web_push.text, input.variables, allowed),
        MANAGED_NOTIF_RENDER_LIMITS.webPushText,
      ),
    };
  }
  const text = input.channel === "telegram"
    ? validatedTemplate.channels.telegram.text
    : input.channel === "max"
      ? validatedTemplate.channels.max.text
      : validatedTemplate.channels.smsc.text;
  const renderedText = replaceVariables(text, input.variables, allowed);
  const maxLength = input.channel === "telegram"
    ? MANAGED_NOTIF_RENDER_LIMITS.telegramText
    : input.channel === "max"
      ? MANAGED_NOTIF_RENDER_LIMITS.maxText
      : MANAGED_NOTIF_RENDER_LIMITS.smscText;
  return {
    channel: input.channel,
    text: validateRenderedText(renderedText, maxLength),
  };
}
