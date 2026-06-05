export type AuthRateLimitCheckParams = {
  scope: string;
  key: string;
  windowMs: number;
  maxPerWindow: number;
};

/** DB-backed sliding-window rate limit (returns `true` when limited). */
export type AuthRateLimitDbPort = {
  checkAndRecord: (params: AuthRateLimitCheckParams) => Promise<boolean>;
};
