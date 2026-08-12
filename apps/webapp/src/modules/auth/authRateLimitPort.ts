export type AuthRateLimitCheckParams = {
  scope: string;
  key: string;
  windowMs: number;
  maxPerWindow: number;
  /** Optional amortized, bounded cleanup request for this exact scope. */
  scopePrune?: {
    retentionMs: number;
    batchSize: number;
  };
};

export type AuthRateLimitAttemptResult = {
  limited: boolean;
  attempts: number;
};

/** DB-backed sliding-window rate limit (returns `true` when limited). */
export type AuthRateLimitDbPort = {
  checkAndRecord: (params: AuthRateLimitCheckParams) => Promise<boolean>;
  recordAndCount: (params: AuthRateLimitCheckParams) => Promise<AuthRateLimitAttemptResult>;
};
