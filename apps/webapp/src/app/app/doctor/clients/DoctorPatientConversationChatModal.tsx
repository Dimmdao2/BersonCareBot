'use client';

import { DoctorConversationChatModal } from '@/modules/messaging/components/DoctorConversationChatModal';
import { useDoctorPatientSupportChat } from './useDoctorPatientSupportChat';

type Props = {
  patientUserId: string;
  patientName: string;
  patientOnSupport?: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
};

/** Resolves a patient conversation, then renders the same modal used by Communications. */
export function DoctorPatientConversationChatModal({
  patientUserId,
  patientName,
  patientOnSupport = false,
  onClose,
  onUnreadChange,
}: Props) {
  const chat = useDoctorPatientSupportChat(patientUserId, onUnreadChange);

  return (
    <DoctorConversationChatModal
      open
      conversationId={chat.conversationId}
      displayName={patientName}
      patientUserId={patientUserId}
      patientOnSupport={patientOnSupport}
      initialMessages={chat.initialMessages}
      loading={chat.loading}
      error={chat.error}
      onRetry={() => void chat.retry()}
      onClose={onClose}
      onReadStateChanged={() => {
        chat.setUnreadCount(0);
        onUnreadChange?.(0);
      }}
    />
  );
}
