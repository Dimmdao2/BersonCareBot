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
  availability: { hasTelegram: boolean; hasMax: boolean; emailVerified: boolean },
): ProfileNotificationTopicModel[] {
  return topics.map((t) => {
    const allowed = allowedChannelsForTopic(t.id);
    const channels: ProfileNotificationChannelModel[] = [];
    for (const code of allowed) {
      if (code === "telegram" && !availability.hasTelegram) continue;
      if (code === "max" && !availability.hasMax) continue;
      if (code === "email" && !availability.emailVerified) continue;
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
