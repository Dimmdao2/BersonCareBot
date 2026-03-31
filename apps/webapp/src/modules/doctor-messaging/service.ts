import type { ChannelBindings } from "@/shared/types/session";
import type { MessageLogListParams, MessageLogPort } from "./ports";

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

function normalizeListParams(params?: MessageLogListParams): Required<Pick<MessageLogListParams, "page" | "pageSize">> & {
  filters: NonNullable<MessageLogListParams["filters"]>;
} {
  const page = Math.max(1, Math.floor(params?.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params?.pageSize ?? 20)));
  const filters = params?.filters ?? {};
  return { page, pageSize, filters };
}

function bindingsToChannelList(b: ChannelBindings): string[] {
  const out: string[] = [];
  if (b.telegramId) out.push("telegram");
  if (b.maxId) out.push("max");
  if (b.vkId) out.push("vk");
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
        channelBindingsUsed: command.channelBindings,
        outcome,
        errorMessage: outcome === "failed" ? "no channels" : null,
      });
      return { success: outcome !== "failed", entry: { id: entry.id } };
    },

    async listMessageHistory(params: { userId: string; page?: number; pageSize?: number }) {
      const normalized = normalizeListParams({ page: params.page, pageSize: params.pageSize });
      return deps.messageLogPort.listByUser(params.userId, normalized);
    },

    async listAllMessages(params?: MessageLogListParams) {
      return deps.messageLogPort.listAll(normalizeListParams(params));
    },
  };
}
