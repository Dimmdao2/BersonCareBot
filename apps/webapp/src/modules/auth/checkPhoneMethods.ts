import type { AuthChannelPolicy } from './authChannelPolicy';

/**
 * Public projection for the legacy `check-phone` compatibility endpoint.
 *
 * These are system capabilities, never facts about the entered phone number. In particular, do
 * not add account existence, bindings, PIN state, an email address, or a preferred channel here.
 */
export type AuthMethodsPayload = {
  /** SMS OTP is not offered by the legacy public web/Mini App picker. */
  sms: boolean;
  telegram: boolean;
  max: boolean;
  email: boolean;
};

/** Maps only global configured-and-enabled channel policy into the public compatibility contract. */
export function getPublicCheckPhoneMethods(policy: AuthChannelPolicy): AuthMethodsPayload {
  return {
    sms: false,
    telegram: policy.telegram,
    max: policy.max,
    email: policy.email,
  };
}
