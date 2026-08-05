import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isSupportChatMessage } from '@/shared/lib/supportMessageKinds';
import type { SupportConversationMessageRow } from '@/modules/messaging/ports';

type Deps = ReturnType<typeof buildAppDeps>;

export type DoctorPatientMessagesSnapshot = {
  conversationId: string | null;
  messages: SupportConversationMessageRow[];
  unreadFromUserCount: number;
};

/**
 * Read-only chat snapshot for overview widgets. Does not create conversations —
 * mutating ensure stays on explicit chat open / send paths.
 */
export async function loadDoctorPatientMessagesSnapshot(
  deps: Deps,
  patientUserId: string,
  organizationId: string,
): Promise<DoctorPatientMessagesSnapshot> {
  const port = deps.supportCommunication;
  const conversations = await port.listConversationsByUser(patientUserId);
  const orgScoped = conversations.filter(
    (c) => !c.organizationId || c.organizationId === organizationId,
  );
  const webappConversation =
    orgScoped.find((c) => c.source === 'webapp' && c.status === 'open') ??
    orgScoped.find((c) => c.source === 'webapp');

  if (!webappConversation) {
    return { conversationId: null, messages: [], unreadFromUserCount: 0 };
  }

  const messages = await port.listMessagesSince(webappConversation.id, {
    sinceCreatedAt: null,
    limit: 100,
    organizationId,
  });
  const unreadFromUserCount = await port.countUnreadUserMessagesForAdminByConversation(
    webappConversation.id,
  );

  return {
    conversationId: webappConversation.id,
    messages: messages.filter(isSupportChatMessage),
    unreadFromUserCount,
  };
}
