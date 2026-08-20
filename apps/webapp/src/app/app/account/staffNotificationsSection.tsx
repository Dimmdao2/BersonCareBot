import type { ReactNode } from 'react';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorNotificationChannelsSection } from '@/app/app/settings/DoctorNotificationChannelsSection';
import { buildDoctorNotificationTopicModels } from '@/modules/doctor-notifications/doctorProfileTopicChannelsModel';
import { parseSpecialistTaskReminderChannels } from '@/modules/specialist-tasks/reminderChannels';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import type { loadStaffAccountPageContext } from './accountContext';

export async function loadStaffNotificationsSection(
  deps: ReturnType<typeof buildAppDeps>,
  session: Awaited<ReturnType<typeof loadStaffAccountPageContext>>['session'],
  workspaceContext: DoctorWorkspaceContext | null,
): Promise<ReactNode> {
  const accountEmail = await deps.userProjection.getProfileEmailFields(session.user.userId);
  const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
  const hasMax = Boolean(session.user.bindings.maxId?.trim());
  const [hasWebPushSubscription, channelPrefs, topicPrefs, doctorSettings] = await Promise.all([
    deps.webPushSubscriptions.hasAnyForUserId(session.user.userId),
    deps.channelPreferencesPort.getPreferences(session.user.userId),
    deps.topicChannelPrefs.listByUserId(session.user.userId),
    workspaceContext?.canAccessClinicalWorkspace
      ? deps.systemSettings.listSettingsByScope('doctor', {
          organizationId: workspaceContext.organizationId,
        })
      : Promise.resolve([]),
  ]);
  const globalWebPushEnabled =
    channelPrefs.find((preference) => preference.channelCode === 'web_push')
      ?.isEnabledForNotifications !== false;
  const taskReminderChannels = parseSpecialistTaskReminderChannels(
    doctorSettings.find((setting) => setting.key === 'doctor_specialist_task_reminder_channels')
      ?.valueJson ?? null,
  );
  const notificationTopics = buildDoctorNotificationTopicModels(
    topicPrefs,
    {
      hasTelegram,
      hasMax,
      emailVerified: Boolean(accountEmail.emailVerifiedAt),
      hasWebPushSubscription,
      globalWebPushEnabled,
    },
    taskReminderChannels,
  );
  return (
    <DoctorNotificationChannelsSection
      initialTopics={notificationTopics}
      hasWebPushSubscription={hasWebPushSubscription}
      globalWebPushEnabled={globalWebPushEnabled}
      hasTelegram={hasTelegram}
      hasMax={hasMax}
      emailVerified={Boolean(accountEmail.emailVerifiedAt)}
    />
  );
}
