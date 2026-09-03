'use client';

import { DoctorModal, DoctorModalCompositeTitle } from '@/shared/ui/doctor/DoctorModal';
import { DoctorChatPanel } from './DoctorChatPanel';

type DoctorConversationChatModalProps = {
  conversationId: string | null;
  displayName: string;
  onClose: () => void;
  onReadStateChanged?: () => void | Promise<void>;
  onSent?: () => void | Promise<void>;
};

/** Canonical doctor chat modal shared by Communications and contextual inboxes. */
export function DoctorConversationChatModal({
  conversationId,
  displayName,
  onClose,
  onReadStateChanged,
  onSent,
}: DoctorConversationChatModalProps) {
  return (
    <DoctorModal
      open={conversationId != null}
      onClose={onClose}
      title={<DoctorModalCompositeTitle label="Чат" entity={displayName || '—'} />}
      size="content"
      desktopPresentation="right-sheet"
      bodyClassName="p-0"
    >
      {conversationId ? (
        <DoctorChatPanel
          key={conversationId}
          conversationId={conversationId}
          className="min-h-0 flex-1"
          onReadStateChanged={onReadStateChanged}
          onSent={onSent}
        />
      ) : null}
    </DoctorModal>
  );
}
