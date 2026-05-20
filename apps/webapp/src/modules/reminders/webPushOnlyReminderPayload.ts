import {
  buildReminderDeepLinkAsync,
  type BuildReminderDeepLinkOptions,
} from "./buildReminderDeepLink";
import type { ReminderIntentSectionLookup } from "./resolveReminderIntentForLinkedObject";
import { notificationTopicCodeFromReminderRule } from "./notificationTopicCode";
import type { WebPushOnlyReminderRuleRow } from "./webPushOnlyPorts";

export function resolveWebPushOnlyReminderTopicCode(rule: WebPushOnlyReminderRuleRow): string | null {
  const explicit = rule.notificationTopicCode?.trim();
  if (explicit) return explicit;
  return notificationTopicCodeFromReminderRule({
    category: rule.category,
    linkedObjectType: rule.linkedObjectType,
  });
}

export async function buildWebPushOnlyReminderNotifyContent(
  rule: WebPushOnlyReminderRuleRow,
  resolveLinkedTitle: (linkedObjectType: string, linkedObjectId: string) => Promise<string | null>,
  opts?: {
    sectionLookup?: ReminderIntentSectionLookup;
    deepLinkOpts?: BuildReminderDeepLinkOptions;
  },
): Promise<{ title: string; bodyText: string; openUrl: string; topicCode: string | null }> {
  let title =
    rule.customTitle?.trim() ||
    rule.displayTitle?.trim() ||
    null;

  if (!title && rule.linkedObjectType && rule.linkedObjectId?.trim()) {
    title = await resolveLinkedTitle(rule.linkedObjectType, rule.linkedObjectId.trim());
  }

  const notifyTitle = title?.trim() || "Напоминание";
  const bodyText = rule.customText?.trim() ?? "";
  const openUrl = await buildReminderDeepLinkAsync(
    {
      linkedObjectType: rule.linkedObjectType,
      linkedObjectId: rule.linkedObjectId,
      reminderIntent: rule.reminderIntent,
    },
    opts?.sectionLookup,
    opts?.deepLinkOpts,
  );
  const topicCode = resolveWebPushOnlyReminderTopicCode(rule);

  return { title: notifyTitle, bodyText, openUrl, topicCode };
}
