export type AuthRateLimitCheckParams = {
  scope: string;
  key: string;
  windowMs: number;
  maxPerWindow: number;
  /** Optional scope-wide retention bound; pruning does not depend on the same key returning. */
  scopeRetentionMs?: number;
};

/** DB-backed sliding-window rate limit (returns `true` when limited). */
export type AuthRateLimitDbPort = {
  checkAndRecord: (params: AuthRateLimitCheckParams) => Promise<boolean>;
};
