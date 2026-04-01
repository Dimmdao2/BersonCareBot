import { googleCalendarConfig, type GoogleCalendarConfig } from './config.js';

export async function getGoogleCalendarConfig(): Promise<GoogleCalendarConfig> {
  return googleCalendarConfig;
}
