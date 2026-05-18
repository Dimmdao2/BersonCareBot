import type { TopicChannelPrefRow } from "./topicChannelPrefsPort";
import {
  allowedChannelsForTopic,
  type PatientTopicChannelCode,
} from "./topicChannelRules";
import { patientNotificationTopicDisplayTitle } from "./topicDisplayTitles";

const CHANNEL_LABEL: Record<PatientTopicChannelCode, string> = {
  telegram: "Telegram",
  max: "MAX",
  email: "Email",
  web_push: "Push",
};

export type ProfileNotificationChannelModel = {
  code: PatientTopicChannelCode;
  label: string;
  isEnabled: boolean;
};

export type ProfileNotificationTopicModel = {
  topicId: string;
  displayTitle: string;
  channels: ProfileNotificationChannelModel[];
};

function resolveTopicChannelEnabled(
  rows: TopicChannelPrefRow[],
  topicCode: string,
  channelCode: PatientTopicChannelCode,
): boolean {
  const row = rows.find((r) => r.topicCode === topicCode && r.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

export function buildProfileNotificationTopicModels(
  topics: Array<{ id: string; title: string }>,
  prefRows: TopicChannelPrefRow[],
  availability: { hasTelegram: boolean; hasMax: boolean; emailVerified: boolean; hasWebPush: boolean },
): ProfileNotificationTopicModel[] {
  return topics.map((t) => {
    const allowed = allowedChannelsForTopic(t.id);
    const channels: ProfileNotificationChannelModel[] = [];
    for (const code of allowed) {
      if (code === "telegram" && !availability.hasTelegram) continue;
      if (code === "max" && !availability.hasMax) continue;
      if (code === "email" && !availability.emailVerified) continue;
      if (code === "web_push" && !availability.hasWebPush) continue;
      channels.push({
        code,
        label: CHANNEL_LABEL[code],
        isEnabled: resolveTopicChannelEnabled(prefRows, t.id, code),
      });
    }
    return {
      topicId: t.id,
      displayTitle: patientNotificationTopicDisplayTitle(t.id, t.title),
      channels,
    };
  });
}

/** Client-side: после subscribe до router.refresh() SSR topics могут быть без колонки Push. */
export function ensureWebPushInNotificationTopics(
  topics: ProfileNotificationTopicModel[],
  hasWebPush: boolean,
): ProfileNotificationTopicModel[] {
  if (!hasWebPush) return topics;
  return topics.map((t) => {
    if (!allowedChannelsForTopic(t.topicId).includes("web_push")) return t;
    if (t.channels.some((c) => c.code === "web_push")) return t;
    return {
      ...t,
      channels: [
        ...t.channels,
        { code: "web_push", label: CHANNEL_LABEL.web_push, isEnabled: true },
      ],
    };
  });
}
