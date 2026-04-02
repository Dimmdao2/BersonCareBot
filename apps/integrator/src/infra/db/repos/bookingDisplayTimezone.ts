/**
 * @deprecated Импортируйте из `config/appTimezone.js` — единая точка для таймзоны приложения.
 */
export {
  DEFAULT_APP_DISPLAY_TIMEZONE as DEFAULT_BOOKING_DISPLAY_TIMEZONE,
  getAppDisplayTimezoneSync,
  getBookingDisplayTimezone,
  resetBookingDisplayTimezoneCache,
} from '../../../config/appTimezone.js';
