/**
 * Re-exports display timezone accessors from `config/appTimezone.js` (DB `system_settings.app_display_timezone`).
 */
export {
  DEFAULT_APP_DISPLAY_TIMEZONE as DEFAULT_BOOKING_DISPLAY_TIMEZONE,
  getAppDisplayTimezone,
  getBookingDisplayTimezone,
} from '../../../config/appTimezone.js';
