export type CreateOAuthPlatformUserInput = {
  phoneNorm: string | null;
  display: string;
  emailRaw: string | null;
  emailVerifiedAt: Date | null;
};

export type UpsertOAuthBindingInput = {
  userId: string;
  provider: string;
  providerUserId: string;
  emailRaw: string | null;
};

export type UpsertOAuthBindingResult = {
  inserted: boolean;
  existingOwnerUserId?: string;
};

export type OAuthUserResolvePort = {
  findCanonicalUserIdByPhone: (phoneNorm: string) => Promise<string | null>;
  resolveCanonicalUserId: (userId: string) => Promise<string | null>;
  applyVerifiedOAuthEmail: (
    userId: string,
    emailRaw: string | null,
    emailTrusted: boolean,
  ) => Promise<void>;
  findUserIdsByVerifiedEmail: (emailNorm: string) => Promise<string[]>;
  /**
   * Active users (merged_into_id IS NULL) owning `emailNorm`, REGARDLESS of email verification.
   * Matches the scope of `uq_platform_users_email_normalized_active`, so it catches phone/booking-
   * created accounts whose email is set but unverified — which `findUserIdsByVerifiedEmail` misses,
   * causing an INSERT duplicate-key crash on OAuth login with a verified copy of that email.
   */
  findActiveUserIdsByEmail: (emailNorm: string) => Promise<string[]>;
  /**
   * F6 §2a item 7 (equal-rights login): owner(s) of `emailNorm` as EITHER the active primary
   * OR a confirmed OAuth-linked secondary (`user_oauth_bindings.email`) — the third tier a plain
   * OAuth sign-in checks after `findUserIdsByVerifiedEmail`/`findActiveUserIdsByEmail` come back
   * empty, so an account is recognized even when this exact address is only its secondary.
   */
  findUserIdsByAnyConfirmedEmail: (emailNorm: string) => Promise<string[]>;
  /** Current active `phone_normalized` of an account, or null if it has none. */
  getActivePhoneForUser: (userId: string) => Promise<string | null>;
  /**
   * F6 case 4 ("email matches, phone differs"): records `phoneNorm` as this account's confirmed
   * phone. Caller must have already checked the account has no active phone and that `phoneNorm`
   * belongs to nobody else — this never closes/replaces an existing active phone.
   */
  addSparePhoneContact: (userId: string, phoneNorm: string) => Promise<void>;
  createOAuthPlatformUser: (input: CreateOAuthPlatformUserInput) => Promise<string>;
  upsertOAuthBinding: (input: UpsertOAuthBindingInput) => Promise<UpsertOAuthBindingResult>;
};

let oauthUserResolvePort: OAuthUserResolvePort | undefined;

export function bindOAuthUserResolvePort(port: OAuthUserResolvePort): void {
  oauthUserResolvePort = port;
}

export function requireOAuthUserResolvePort(): OAuthUserResolvePort {
  if (!oauthUserResolvePort) {
    throw new Error(
      'OAuthUserResolvePort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.',
    );
  }
  return oauthUserResolvePort;
}
