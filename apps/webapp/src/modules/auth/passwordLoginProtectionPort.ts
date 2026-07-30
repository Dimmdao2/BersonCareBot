import type { Challenge } from 'altcha-lib';
import type { PasswordAltchaProof } from '@/modules/auth/passwordLoginProtection';

export type PasswordProofAdmission =
  | {
      acquired: true;
      leaseToken: string;
      passwordHash: string;
      userId: string | null;
      captchaRequired: boolean;
    }
  | {
      acquired: false;
      reason: 'locked' | 'cooldown' | 'busy' | 'challenge_required' | 'invalid';
      attempts: number;
      retryAfterSeconds: number;
      captchaRequired: boolean;
    };

export type PasswordProofCompletion =
  | {
      accepted: true;
      succeeded: true;
      userId: string;
      emailVerified: boolean;
    }
  | {
      accepted: true;
      succeeded: false;
      attempts: number;
      retryAfterSeconds: number;
      captchaRequired: boolean;
    }
  | { accepted: false };

export type PasswordLoginProtectionPort = {
  acquirePasswordProof(params: {
    emailNormalized: string;
    identifierKey: string;
    altchaProof?: PasswordAltchaProof;
  }): Promise<PasswordProofAdmission>;
  completePasswordProof(params: {
    leaseToken: string;
    passwordVerified: boolean;
  }): Promise<PasswordProofCompletion>;
  readAltchaRootSecret(): Promise<string | null>;
  registerAltchaChallenge(params: {
    emailNormalized: string;
    challengeId: string;
    challengeDigest: string;
    expiresAt: Date;
  }): Promise<boolean>;
};

export type PasswordAltchaChallenge = {
  challenge: Challenge;
  expiresAt: string;
};
