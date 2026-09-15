import { describe, expect, it } from 'vitest';
import { buildDoctorNotificationTopicModels } from './doctorProfileTopicChannelsModel';

describe('lead notification topic availability', () => {
  it('keeps lead notifications out of the profile until the leads workspace module is effective', () => {
    const unavailableTopics = buildDoctorNotificationTopicModels(
      [],
      {
        hasTelegram: false,
        hasMax: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        globalWebPushEnabled: false,
        hasLeads: false,
      },
      [],
    );
    const availableTopics = buildDoctorNotificationTopicModels(
      [],
      {
        hasTelegram: false,
        hasMax: false,
        emailVerified: false,
        hasWebPushSubscription: false,
        globalWebPushEnabled: false,
        hasLeads: true,
      },
      [],
    );

    expect(unavailableTopics.some((topic) => topic.topicId === 'doctor_leads')).toBe(false);
    expect(availableTopics.some((topic) => topic.topicId === 'doctor_leads')).toBe(true);
  });
});
