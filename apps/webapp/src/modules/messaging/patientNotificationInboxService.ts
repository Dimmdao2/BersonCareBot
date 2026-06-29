type PatientNotificationInboxMessage = {
  id: string;
  integratorMessageId: string;
  conversationId: string;
  senderRole: string;
  messageType: string;
  text: string;
  source: string;
  externalChatId: string | null;
  externalMessageId: string | null;
  deliveryStatus: string | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
};

type PatientNotificationInboxPort = {
  listNotificationMessagesForUser(platformUserId: string, limit: number): Promise<PatientNotificationInboxMessage[]>;
  countUnreadNotificationsForUser(platformUserId: string): Promise<number>;
  markNotificationMessagesReadForUser(platformUserId: string): Promise<void>;
};

export function createPatientNotificationInboxService(port: PatientNotificationInboxPort) {
  return {
    async bootstrap(platformUserId: string): Promise<{
      messages: PatientNotificationInboxMessage[];
      unreadCount: number;
    }> {
      const [messages, unreadCount] = await Promise.all([
        port.listNotificationMessagesForUser(platformUserId, 100),
        port.countUnreadNotificationsForUser(platformUserId),
      ]);
      return { messages, unreadCount };
    },

    async markRead(platformUserId: string): Promise<void> {
      await port.markNotificationMessagesReadForUser(platformUserId);
    },
  };
}
