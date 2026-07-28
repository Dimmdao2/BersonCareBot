/**
 * Persisted pending state for registration verify / password reset on the login surface.
 * Пароль намеренно не храним — только идентификаторы и подсказки cooldown.
 */

const STORAGE_KEY = 'bc_auth_flow_pending_v1';

export type AuthFlowPendingStored =
  | {
      v: 1;
      mode: 'register_verify';
      email: string;
      challengeId: string;
      attemptId?: string;
      retryAfterSeconds: number;
      savedAt: number;
      lastName: string | null;
      firstName: string | null;
      patronymic: string | null;
      purpose?: 'patient_email_otp';
      /** Old payloads keep confirming the existing challenge, but cannot resend via the structured API. */
      legacyDisplayName?: string;
    }
  | {
      v: 1;
      mode: 'password_reset';
      email: string;
      retryAfterSeconds: number;
      savedAt: number;
      /** Если клиент уже знает challenge (редко — forgot не возвращает id) */
      challengeId?: string;
    }
  | {
      v: 1;
      mode: 'specialist_signup_verify';
      email: string;
      challengeId: string;
      retryAfterSeconds: number;
      savedAt: number;
      lastName: string | null;
      firstName: string | null;
      patronymic: string | null;
      /** Old payloads keep confirming the existing challenge, but cannot resend via the structured API. */
      legacySpecialistName?: string;
      organizationTitle: string;
      organizationSlug: string;
    };

function readRaw(): AuthFlowPendingStored | null {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return null;
    const o = JSON.parse(raw) as Partial<AuthFlowPendingStored>;
    if (
      o.v !== 1 ||
      (o.mode !== 'register_verify' &&
        o.mode !== 'password_reset' &&
        o.mode !== 'specialist_signup_verify')
    ) {
      return null;
    }
    if (o.mode === 'register_verify') {
      if (
        typeof o.email !== 'string' ||
        typeof o.challengeId !== 'string' ||
        typeof o.retryAfterSeconds !== 'number'
      ) {
        return null;
      }
      if (
        typeof o.lastName === 'string' &&
        typeof o.firstName === 'string' &&
        typeof o.patronymic === 'string'
      ) {
        // Current structured payload.
      } else if (typeof (o as { displayName?: unknown }).displayName === 'string') {
        Object.assign(o, {
          lastName: null,
          firstName: null,
          patronymic: null,
          legacyDisplayName: (o as { displayName: string }).displayName,
        });
      } else {
        return null;
      }
    } else if (o.mode === 'password_reset') {
      if (typeof o.email !== 'string' || typeof o.retryAfterSeconds !== 'number') return null;
    } else {
      const specialistPending = o as Partial<
        Extract<AuthFlowPendingStored, { mode: 'specialist_signup_verify' }>
      >;
      if (
        typeof specialistPending.email !== 'string' ||
        typeof specialistPending.challengeId !== 'string' ||
        typeof specialistPending.retryAfterSeconds !== 'number' ||
        typeof specialistPending.organizationTitle !== 'string'
      ) {
        return null;
      }
      if (specialistPending.organizationSlug === undefined) {
        // Payloads saved before mandatory clinic slugs shipped remain recoverable after cutover.
        Object.assign(specialistPending, { organizationSlug: '' });
      } else if (typeof specialistPending.organizationSlug !== 'string') {
        return null;
      }
      if (
        typeof specialistPending.lastName === 'string' &&
        typeof specialistPending.firstName === 'string' &&
        typeof specialistPending.patronymic === 'string'
      ) {
        // Current structured payload.
      } else if (
        typeof (specialistPending as { specialistName?: unknown }).specialistName === 'string'
      ) {
        Object.assign(specialistPending, {
          lastName: null,
          firstName: null,
          patronymic: null,
          legacySpecialistName: (specialistPending as { specialistName: string }).specialistName,
        });
      } else {
        return null;
      }
    }
    const maxAgeMs = 1000 * 60 * 60 * 72;
    if (typeof o.savedAt !== 'number' || Date.now() - o.savedAt > maxAgeMs) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return o as AuthFlowPendingStored;
  } catch {
    return null;
  }
}

export function readAuthFlowPending(): AuthFlowPendingStored | null {
  return readRaw();
}

export function clearAuthFlowPending(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function saveRegisterVerifyPending(
  input: Omit<
    Extract<AuthFlowPendingStored, { mode: 'register_verify' }>,
    'v' | 'savedAt' | 'mode'
  >,
): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  const payload: AuthFlowPendingStored = {
    v: 1,
    mode: 'register_verify',
    ...input,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function patchRegisterVerifyChallenge(challengeId: string, retryAfterSeconds: number): void {
  const cur = readRaw();
  if (!cur || cur.mode !== 'register_verify') return;
  saveRegisterVerifyPending({
    email: cur.email,
    challengeId,
    retryAfterSeconds,
    lastName: cur.lastName,
    firstName: cur.firstName,
    patronymic: cur.patronymic,
    purpose: cur.purpose,
  });
}

export function savePasswordResetPending(
  input: Omit<Extract<AuthFlowPendingStored, { mode: 'password_reset' }>, 'v' | 'savedAt' | 'mode'>,
): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  const payload: AuthFlowPendingStored = {
    v: 1,
    mode: 'password_reset',
    ...input,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function saveSpecialistSignupVerifyPending(
  input: Omit<
    Extract<AuthFlowPendingStored, { mode: 'specialist_signup_verify' }>,
    'v' | 'savedAt' | 'mode'
  >,
): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  const payload: AuthFlowPendingStored = {
    v: 1,
    mode: 'specialist_signup_verify',
    ...input,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
