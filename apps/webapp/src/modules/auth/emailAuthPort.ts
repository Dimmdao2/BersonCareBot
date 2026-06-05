export type EmailChallengeRow = {
  id: string;
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
};

export type EmailChallengeCodeRow = {
  id: string;
  code_hash: string;
  expires_at: string;
  attempts: string;
};

export type EmailAuthDbPort = {
  findEmailSendCooldown: (userId: string, emailNormalized: string) => Promise<Date | null>;
  deleteEmailChallengesForUser: (userId: string) => Promise<void>;
  insertEmailChallenge: (params: {
    userId: string;
    email: string;
    codeHash: string;
    expiresAt: number;
  }) => Promise<string>;
  deleteEmailChallengeById: (challengeId: string) => Promise<void>;
  upsertEmailSendCooldown: (userId: string, emailNormalized: string) => Promise<void>;
  findEmailChallengeForConfirm: (challengeId: string, userId: string) => Promise<EmailChallengeRow | null>;
  updateEmailChallengeAttempts: (challengeId: string, attempts: number) => Promise<void>;
  findEmailOwnerConflict: (userId: string, email: string) => Promise<boolean>;
  verifyUserEmail: (userId: string, email: string) => Promise<void>;
  findEmailChallengeForConsume: (challengeId: string, userId: string) => Promise<EmailChallengeCodeRow | null>;
  findLatestEmailChallengeForUser: (userId: string, nowSec: number) => Promise<EmailChallengeCodeRow | null>;
};
