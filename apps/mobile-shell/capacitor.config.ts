import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android flavor values are the source of truth at runtime. This checked-in
 * remote configuration exists for Capacitor's generated project and is replaced
 * by the flavor-specific Bridge builder before the first page is loaded.
 */
const config: CapacitorConfig = {
  appId: 'ru.therapygo.app',
  appName: 'Therapy Go',
  webDir: 'www',
  loggingBehavior: 'debug',
  server: {
    url: 'https://therapygo.ru',
    appStartPath: '/app/patient',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    loggingBehavior: 'debug',
  },
};

export default config;
