import type { PatientTopicChannelCode } from "./topicChannelRules";

export type TopicChannelPrefRow = {
  topicCode: string;
  channelCode: PatientTopicChannelCode;
  isEnabled: boolean;
};

export type TopicChannelPrefsPort = {
  listByUserId: (userId: string) => Promise<TopicChannelPrefRow[]>;
  upsert: (
    userId: string,
    topicCode: string,
    channelCode: PatientTopicChannelCode,
    isEnabled: boolean,
  ) => Promise<void>;
};
