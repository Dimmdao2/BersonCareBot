import type { UserByPhonePort } from './userByPhonePort';

export type SessionUserPort = Pick<
  UserByPhonePort,
  'findByUserId' | 'getVerifiedEmailForUser' | 'invalidateSessionsForSelf'
>;

let sessionUserPort: SessionUserPort | undefined;

/** Composition root binds the canonical session-user port once. */
export function bindSessionUserPort(port: SessionUserPort): void {
  sessionUserPort = port;
}

export function requireSessionUserPort(): SessionUserPort {
  if (!sessionUserPort) {
    throw new Error('SessionUserPort is not bound. Call ensureAuthModulePortsBound().');
  }
  return sessionUserPort;
}
