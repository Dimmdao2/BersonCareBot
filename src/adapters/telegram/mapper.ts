// Map callback_data / payloads to domain actions (optional central place)
export const NOTIFY_KEYS = ['notify_toggle_spb', 'notify_toggle_msk', 'notify_toggle_online', 'notify_toggle_all'] as const;
export const MENU_NOTIFICATIONS = 'menu_notifications';
export const MENU_MY_BOOKINGS = 'menu_my_bookings';
export const MENU_BACK = 'menu_back';

export function isNotifyCallback(data: string): boolean {
  return data.startsWith('notify_');
}
