export function shouldShowGoogleCalendarSettings(
  platformIntegrationAvailable: boolean,
  externalCalendarEnabled: boolean,
): boolean {
  return platformIntegrationAvailable && externalCalendarEnabled;
}
