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
    captchaVerifiedExternally?: boolean;
  }): Promise<PasswordProofAdmission>;
  completePasswordProof(params: {
    leaseToken: string;
    passwordVerified: boolean;
  }): Promise<PasswordProofCompletion>;
  readAltchaRootSecret(): Promise<string | null>;
  readCaptchaConfig?(): Promise<{
    provider: 'altcha' | 'yandex';
    yandexClientKey: string | null;
    yandexServerKey: string | null;
  }>;
  registerAltchaChallenge(params: {
    emailNormalized: string;
    challengeId: string;
    challengeDigest: string;
    expiresAt: Date;
  }): Promise<boolean>;
  /**
   * Задачка публичной заявки одноразовая ровно потому, что её регистрируют при выдаче и гасят при
   * приёме. Без пары этих вызовов один решённый payload действителен всё окно жизни задачки
   * сколько угодно раз, то есть стоимость решения размазывается на неограниченный поток заявок.
   * Ключ здесь уже производный от адреса (`lead-email:v1:<sha256>`) — сама почта в дверь не идёт.
   */
  registerPublicLeadAltchaChallenge(params: {
    identifierKey: string;
    challengeId: string;
    challengeDigest: string;
    expiresAt: Date;
  }): Promise<boolean>;
  consumePublicLeadAltchaChallenge(params: {
    identifierKey: string;
    challengeId: string;
    challengeDigest: string;
  }): Promise<boolean>;
};

export type PasswordAltchaChallenge = {
  provider: 'altcha';
  challenge: Challenge;
  expiresAt: string;
};

export type PasswordYandexCaptchaChallenge = {
  provider: 'yandex';
  clientKey: string;
};

export type PasswordCaptchaChallenge = PasswordAltchaChallenge | PasswordYandexCaptchaChallenge;
