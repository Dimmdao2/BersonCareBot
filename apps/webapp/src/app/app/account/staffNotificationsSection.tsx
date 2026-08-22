import type { ReactNode } from 'react';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { runWithStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { DoctorNotificationChannelsSection } from '@/app/app/settings/DoctorNotificationChannelsSection';
import { buildDoctorNotificationTopicModels } from '@/modules/doctor-notifications/doctorProfileTopicChannelsModel';
import { parseSpecialistTaskReminderChannels } from '@/modules/specialist-tasks/reminderChannels';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import type { loadStaffAccountPageContext } from './accountContext';

/**
 * Личные каналы уведомлений человека — почта, мессенджеры, web-push, темы — читаются под
 * ИДЕНТИЧНОСТЬЮ-СЕБЯ (`app_patient`, [staffSecuritySelfPrincipal]), а не под тем принципалом, который
 * оказался у страницы. Это та же дверь, которой личные разделы `/app/account` уже ходят за
 * состоянием 2FA, и единственная стена, объявленная на всех пяти личных таблицах
 * (`user_contacts`, `user_channel_preferences`, `user_notification_topics`,
 * `user_notification_topic_channels`, `user_web_push_subscriptions`): политика в каждой пускает
 * ровно свою строку (`platform_user_id = app.current_patient_user_id()`).
 *
 * Почему это правило, а не правка одной страницы (замер 22.08.2026, живой обход TEST и повтор на
 * `bcb_webapp_dev`): `/app/admin/notifications` — платформенная страница, её принципал
 * `app_platform_settings`, и у этой роли нет ни гранта, ни политики ни на одной из пяти таблиц.
 * После цутовера почты в `public.user_contacts` (`20260821T040000`) первое же чтение — почта
 * человека — отказало `42501 permission denied for table user_contacts`, и страница отдавала 500.
 * Грант платформенной роли на эти таблицы был бы ОТКРЫТИЕМ чужих ПДн глобальному админу ради его
 * собственной почты: правильная стена здесь — своя строка, а не роль страницы. Выбор стены стоит
 * здесь, в единственном месте, где этот раздел читает базу, поэтому следующая страница, которая
 * его отрисует под своим принципалом, не воспроизведёт отказ.
 *
 * Организационная настройка (`doctor`-scope) остаётся за пределами этой области: она арендаторская,
 * её стена — `app_staff` текущей клиники, и под идентичностью-себя она бы отказала.
 */
export async function loadStaffNotificationsSection(
  deps: ReturnType<typeof buildAppDeps>,
  session: Awaited<ReturnType<typeof loadStaffAccountPageContext>>['session'],
  workspaceContext: DoctorWorkspaceContext | null,
): Promise<ReactNode> {
  const hasTelegram = Boolean(session.user.bindings.telegramId?.trim());
  const hasMax = Boolean(session.user.bindings.maxId?.trim());
  const [accountEmail, hasWebPushSubscription, channelPrefs, topicPrefs] =
    await runWithStaffSecuritySelfPrincipal(
      session.user.userId,
      'account:notifications-self',
      () =>
        Promise.all([
          deps.userProjection.getProfileEmailFields(session.user.userId),
          deps.webPushSubscriptions.hasAnyForUserId(session.user.userId),
          deps.channelPreferencesPort.getPreferences(session.user.userId),
          deps.topicChannelPrefs.listByUserId(session.user.userId),
        ]),
    );
  const doctorSettings = workspaceContext?.canAccessClinicalWorkspace
    ? await deps.systemSettings.listSettingsByScope('doctor', {
        organizationId: workspaceContext.organizationId,
      })
    : [];
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
