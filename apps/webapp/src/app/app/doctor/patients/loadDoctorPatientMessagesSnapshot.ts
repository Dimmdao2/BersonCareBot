import type { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isSupportChatMessage } from '@/shared/lib/supportMessageKinds';
import type { SupportConversationMessageRow } from '@/modules/messaging/ports';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

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
  visibilityActor: PatientVisibilityActor,
): Promise<DoctorPatientMessagesSnapshot> {
  // Restricted patient communication is never projected from organization membership alone.
  // The current messaging list is the actor-aware conversation seam; without a specialist
  // identity there is no participant/recipient identity, so the snapshot fails closed.
  if (!visibilityActor.specialistId) {
    return { conversationId: null, messages: [], unreadFromUserCount: 0 };
  }

  const port = deps.supportCommunication;
  const [conversations, permittedConversations] = await Promise.all([
    port.listConversationsByUser(patientUserId),
    deps.messaging.doctorSupport.listOpenConversations({
      organizationId,
      visibilityActor,
      limit: 100,
    }),
  ]);
  const permittedIds = new Set(permittedConversations.map((row) => row.conversationId));
  const orgScoped = conversations.filter(
    (conversation) =>
      conversation.organizationId === organizationId && permittedIds.has(conversation.id),
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
