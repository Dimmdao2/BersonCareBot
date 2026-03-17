import type { ChannelBindings, SessionUser } from "@/shared/types/session";
import type { ChannelContext } from "@/modules/auth/channelContext";
import type { UserByPhonePort } from "@/modules/auth/userByPhonePort";
import { channelToBindingKey } from "@/modules/auth/channelContext";

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
  async findByPhone(normalizedPhone: string): Promise<SessionUser | null> {
    return usersByPhone.get(normalizedPhone) ?? null;
  },

  async createOrBind(phone: string, context: ChannelContext): Promise<SessionUser> {
    const normalized = normalizePhone(phone);
    const existing = usersByPhone.get(normalized);
    if (existing) {
      const updated: SessionUser = {
        ...existing,
        bindings: mergeBindings(existing.bindings, context),
        displayName: context.displayName ?? existing.displayName,
      };
      usersByPhone.set(normalized, updated);
      return updated;
    }
    const key = channelToBindingKey(context.channel);
    const bindings: ChannelBindings = {};
    if (key) {
      (bindings as Record<string, string>)[key] = context.chatId;
    }
    const user: SessionUser = {
      userId: `phone:${nextId++}`,
      role: "client",
      displayName: context.displayName ?? normalized,
      phone: normalized,
      bindings,
    };
    usersByPhone.set(normalized, user);
    return user;
  },
};

function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length >= 10 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+7${digits}`;
  return `+${digits}`;
}
