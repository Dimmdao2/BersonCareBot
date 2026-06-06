import type { ChannelBindings } from "@/shared/types/session";
import type { MessageLogListParams, MessageLogPort } from "./ports";
import { normalizeMessageLogListParams } from "./messageLogListQuery";

export type PrepareDraftParams = { userId: string };
export type PrepareDraftResult = {
  clientUserId: string;
  clientLabel: string;
  channelBindings: ChannelBindings;
  availableChannels: string[];
};

export type SendMessageCommand = {
  userId: string;
  senderId: string;
  text: string;
  category: string;
  channelBindings: ChannelBindings;
};

export type DoctorMessagingServiceDeps = {
  getClientIdentity: (userId: string) => Promise<{ userId: string; displayName: string; bindings: ChannelBindings } | null>;
  getDeliveryTargets: (params: { phone?: string; telegramId?: string; maxId?: string }) => Promise<{ channelBindings: ChannelBindings } | null>;
  messageLogPort: MessageLogPort;
};

function bindingsToChannelList(b: ChannelBindings): string[] {
  const out: string[] = [];
  if (b.telegramId) out.push("telegram");
  if (b.maxId) out.push("max");
  if (b.vkId) out.push("vk");
  return out;
}

function bindingsToLogRecord(b: ChannelBindings): Record<string, string> {
  const out: Record<string, string> = {};
  if (b.telegramId) out.telegramId = b.telegramId;
  if (b.maxId) out.maxId = b.maxId;
  if (b.vkId) out.vkId = b.vkId;
  return out;
}

export function createDoctorMessagingService(deps: DoctorMessagingServiceDeps) {
  return {
    async prepareMessageDraft(params: PrepareDraftParams): Promise<PrepareDraftResult | null> {
      const identity = await deps.getClientIdentity(params.userId);
      if (!identity) return null;
      const targets = await deps.getDeliveryTargets({
        telegramId: identity.bindings.telegramId ?? undefined,
        maxId: identity.bindings.maxId ?? undefined,
      });
      const channelBindings = targets?.channelBindings ?? {};
      const availableChannels = bindingsToChannelList(channelBindings);
      return {
        clientUserId: identity.userId,
        clientLabel: identity.displayName,
        channelBindings,
        availableChannels,
      };
    },

    async sendMessage(command: SendMessageCommand): Promise<{ success: boolean; entry: { id: string } }> {
      const channelsUsed = bindingsToChannelList(command.channelBindings);
      const outcome = channelsUsed.length === 0 ? "failed" as const : "sent";
      const entry = await deps.messageLogPort.append({
        userId: command.userId,
        senderId: command.senderId,
        text: command.text,
        category: command.category,
        channelBindingsUsed: bindingsToLogRecord(command.channelBindings),
        outcome,
        errorMessage: outcome === "failed" ? "no channels" : null,
      });
      return { success: outcome !== "failed", entry: { id: entry.id } };
    },

    async listMessageHistory(params: { userId: string; page?: number; pageSize?: number }) {
      const normalized = normalizeMessageLogListParams({ page: params.page, pageSize: params.pageSize });
      return deps.messageLogPort.listByUser(params.userId, normalized);
    },

    async listAllMessages(params?: MessageLogListParams) {
      return deps.messageLogPort.listAll(normalizeMessageLogListParams(params));
    },
  };
}
