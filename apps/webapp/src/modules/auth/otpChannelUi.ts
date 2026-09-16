/** Public UI projection of the platform auth-channel policy. */
export type AuthChannelUiPolicy = Readonly<{
  email: boolean;
  sms: boolean;
  telegram: boolean;
  max: boolean;
}>;

/** Missing public policy data must never make a channel appear enabled. */
export const FAIL_CLOSED_AUTH_CHANNEL_UI_POLICY: AuthChannelUiPolicy = Object.freeze({
  email: false,
  sms: false,
  telegram: false,
  max: false,
});

/** Каналы доставки OTP в UI (вход / выбор способа). */
export type OtpUiChannel = 'sms' | 'telegram' | 'max' | 'email';
