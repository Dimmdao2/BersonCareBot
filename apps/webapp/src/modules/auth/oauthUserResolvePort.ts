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
  createOAuthPlatformUser: (input: CreateOAuthPlatformUserInput) => Promise<string>;
  upsertOAuthBinding: (input: UpsertOAuthBindingInput) => Promise<UpsertOAuthBindingResult>;
};

let oauthUserResolvePort: OAuthUserResolvePort | undefined;

export function bindOAuthUserResolvePort(port: OAuthUserResolvePort): void {
  oauthUserResolvePort = port;
}

export function requireOAuthUserResolvePort(): OAuthUserResolvePort {
  if (!oauthUserResolvePort) {
    throw new Error("OAuthUserResolvePort is not bound. Call ensureAuthModulePortsBound() from buildAppDeps.");
  }
  return oauthUserResolvePort;
}
