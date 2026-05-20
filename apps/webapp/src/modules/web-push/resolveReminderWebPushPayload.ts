import {
  buildReminderWebPushCopy,
  type WarmupPushDynamicContext,
} from "./pushNotificationCopy";

export type ReminderWebPushCopyInput = {
  stableKey: string;
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  reminderIntent?: string | null;
  occurrenceCategory?: string | null;
  openUrl: string;
  customTitle?: string | null;
  customText?: string | null;
  warmupContext?: WarmupPushDynamicContext;
};

export function resolveReminderWebPushPayload(
  input: ReminderWebPushCopyInput,
): { title: string; body: string; tag: string } | null {
  const copy = buildReminderWebPushCopy({
    stableKey: input.stableKey,
    linkedObjectType: input.linkedObjectType,
    linkedObjectId: input.linkedObjectId,
    reminderIntent: input.reminderIntent,
    occurrenceCategory: input.occurrenceCategory,
    openUrl: input.openUrl,
    customTitle: input.customTitle,
    customText: input.customText,
    warmupContext: input.warmupContext,
  });
  if (!copy) return null;
  return {
    title: copy.title,
    body: copy.body,
    tag: `reminder:${input.stableKey}`.slice(0, 240),
  };
}
