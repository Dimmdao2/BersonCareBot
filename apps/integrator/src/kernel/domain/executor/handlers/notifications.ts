import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asString,
  defaultNotificationSettings,
  persistWrites,
  readNotificationSettings,
} from '../helpers.js';

export async function handleNotifications(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (action.type === 'notifications.get') {
    const settings = deps.readPort
      ? await deps.readPort.readDb<import('../../../contracts/index.js').NotificationSettings | null>({
          type: 'notifications.settings',
          params: {
            resource: ctx.event.meta.source,
            channelUserId: action.params.channelUserId ?? action.params.channelId,
          },
        })
      : null;
    return {
      actionId: action.id,
      status: 'success',
      values: { notifications: settings ?? defaultNotificationSettings() },
    };
  }

  if (action.type === 'notifications.toggle') {
    const currentSettings = readNotificationSettings(ctx)
      ?? (deps.readPort
        ? await deps.readPort.readDb<import('../../../contracts/index.js').NotificationSettings | null>({
            type: 'notifications.settings',
            params: {
              resource: ctx.event.meta.source,
              channelUserId: action.params.channelUserId ?? action.params.channelId,
            },
          }) ?? defaultNotificationSettings()
        : defaultNotificationSettings());
    const toggleKey = asString(action.params.toggleKey);
    let nextSettings = { ...currentSettings };
    if (toggleKey === 'notify_toggle_spb') nextSettings.notify_spb = !currentSettings.notify_spb;
    if (toggleKey === 'notify_toggle_msk') nextSettings.notify_msk = !currentSettings.notify_msk;
    if (toggleKey === 'notify_toggle_online') nextSettings.notify_online = !currentSettings.notify_online;
    if (toggleKey === 'notify_toggle_bookings') nextSettings.notify_bookings = !currentSettings.notify_bookings;
    if (toggleKey === 'notify_toggle_all' && action.params.supportsToggleAll === true) {
      const allEnabled = currentSettings.notify_spb && currentSettings.notify_msk && currentSettings.notify_online && currentSettings.notify_bookings;
      nextSettings = {
        notify_spb: !allEnabled,
        notify_msk: !allEnabled,
        notify_online: !allEnabled,
        notify_bookings: !allEnabled,
      };
    }
    const writes = [{
      type: 'notifications.update' as const,
      params: {
        resource: ctx.event.meta.source,
        channelUserId: action.params.channelUserId ?? action.params.channelId,
        notify_spb: nextSettings.notify_spb,
        notify_msk: nextSettings.notify_msk,
        notify_online: nextSettings.notify_online,
        notify_bookings: nextSettings.notify_bookings,
      },
    }];
    await persistWrites(deps.writePort, writes);
    return {
      actionId: action.id,
      status: 'success',
      writes,
      values: { notifications: nextSettings },
    };
  }

  return { actionId: action.id, status: 'skipped', error: 'NOTIFICATIONS_HANDLER_UNKNOWN_TYPE' };
}
