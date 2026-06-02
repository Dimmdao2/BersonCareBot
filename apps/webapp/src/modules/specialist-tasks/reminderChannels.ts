import {
  DEFAULT_SPECIALIST_TASK_REMINDER_CHANNELS,
  SPECIALIST_TASK_REMINDER_CHANNEL_CODES,
  type SpecialistTaskReminderChannelCode,
} from "./types";

export function parseSpecialistTaskReminderChannels(valueJson: unknown): SpecialistTaskReminderChannelCode[] {
  if (valueJson === null || typeof valueJson !== "object") {
    return [...DEFAULT_SPECIALIST_TASK_REMINDER_CHANNELS];
  }
  let root: Record<string, unknown> = valueJson as Record<string, unknown>;
  if (
    root.value !== undefined &&
    typeof root.value === "object" &&
    root.value !== null &&
    !("channels" in root)
  ) {
    root = root.value as Record<string, unknown>;
  }
  const raw = root.channels ?? root.value;
  const list = Array.isArray(raw) ? raw : Array.isArray((valueJson as Record<string, unknown>).value) ?
    ((valueJson as Record<string, unknown>).value as unknown[])
  : null;
  if (!list) return [...DEFAULT_SPECIALIST_TASK_REMINDER_CHANNELS];
  const out: SpecialistTaskReminderChannelCode[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    if ((SPECIALIST_TASK_REMINDER_CHANNEL_CODES as readonly string[]).includes(item)) {
      out.push(item as SpecialistTaskReminderChannelCode);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_SPECIALIST_TASK_REMINDER_CHANNELS];
}
