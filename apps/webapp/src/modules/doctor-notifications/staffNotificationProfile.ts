import type { ChannelPreference } from '@/modules/channel-preferences/types';
import type { TopicChannelPrefRow } from '@/modules/patient-notifications/topicChannelPrefsPort';

/**
 * Everything one staff recipient's delivery decision needs: who, through which messenger, with
 * which channel preferences and whether a web-push subscription exists.
 *
 * It exists as one value because some producers cannot assemble it piece by piece. A producer whose
 * DB principal has no relational path to the staff preference/binding/subscription tables resolves
 * the whole set through a single named root and hands the result over ready-made.
 */
export type StaffNotificationProfile = {
  userId: string;
  telegramId: string | null;
  maxId: string | null;
  hasWebPushSubscription: boolean;
  channelPreferences: ChannelPreference[];
  topicChannelPreferences: TopicChannelPrefRow[];
};
