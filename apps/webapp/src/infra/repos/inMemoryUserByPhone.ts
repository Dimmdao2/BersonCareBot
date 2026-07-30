import type { ChannelBindings, SessionUser } from '@/shared/types/session';
import type { ChannelContext } from '@/modules/auth/channelContext';
import type { UserByPhonePort, CreateOrBindResult } from '@/modules/auth/userByPhonePort';
import { channelToBindingKey } from '@/modules/auth/channelContext';
import { normalizePhone } from '@/modules/auth/phoneNormalize';

const usersByPhone = new Map<string, SessionUser>();
let nextId = 1;

function mergeBindings(bindings: ChannelBindings, context: ChannelContext): ChannelBindings {
  const key = channelToBindingKey(context.channel);
  const next = { ...bindings };
  if (key) {
    (next as Record<string, string>)[key] = context.chatId;
  }
  return next;
}

export const inMemoryUserByPhonePort: UserByPhonePort = {
  async getPhoneByUserId(userId: string): Promise<string | null> {
    for (const u of usersByPhone.values()) {
      if (u.userId === userId) {
        return u.phone ?? null;
      }
    }
    return null;
  },

  async getVerifiedEmailForUser(_userId: string): Promise<string | null> {
    return null;
  },

  async isPhoneTrustedForUser(userId: string): Promise<boolean> {
    for (const u of usersByPhone.values()) {
      if (u.userId === userId) return Boolean(u.phone);
    }
    return false;
  },

  async findByUserId(userId: string): Promise<SessionUser | null> {
    for (const u of usersByPhone.values()) {
      if (u.userId === userId) {
        return { ...u };
      }
    }
    return null;
  },

  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    return usersByPhone.get(normalizedPhone) ?? null;
  },

  async createOrBind(phone: string, context: ChannelContext): Promise<CreateOrBindResult> {
    const normalized = normalizePhone(phone);
    const existing = usersByPhone.get(normalized);
    if (existing) {
      const updated: SessionUser = {
        ...existing,
        bindings: mergeBindings(existing.bindings, context),
        displayName: context.displayName ?? existing.displayName,
      };
      usersByPhone.set(normalized, updated);
      return { user: updated, wasCreated: false };
    }
    const key = channelToBindingKey(context.channel);
    const bindings: ChannelBindings = {};
    if (key) {
      (bindings as Record<string, string>)[key] = context.chatId;
    }
    const user: SessionUser = {
      userId: `phone:${nextId++}`,
      role: 'client',
      displayName: context.displayName ?? normalized,
      phone: normalized,
      bindings,
    };
    usersByPhone.set(normalized, user);
    return { user, wasCreated: true };
  },

  async invalidateSessionsForSelf(): Promise<void> {
    // No-op: the in-memory port has no `platform_users` row and therefore no epoch to increment.
    // Sessions backed by it are not DB-backed, so the chokepoint never compares an epoch for them.
    // Real enforcement is covered by pgUserByPhone.invalidateSessionsForSelf + its dedicated tests.
  },
};
