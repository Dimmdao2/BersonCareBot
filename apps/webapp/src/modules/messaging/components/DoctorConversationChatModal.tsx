'use client';

import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { DoctorChatPanel } from './DoctorChatPanel';

type DoctorConversationChatModalProps = {
  conversationId: string | null;
  displayName: string;
  patientUserId?: string | null;
  patientOnSupport?: boolean;
  onClose: () => void;
  onReadStateChanged?: () => void | Promise<void>;
  onSent?: () => void | Promise<void>;
};

/** Canonical doctor chat modal shared by Communications and contextual inboxes. */
export function DoctorConversationChatModal({
  conversationId,
  displayName,
  patientUserId,
  patientOnSupport = false,
  onClose,
  onReadStateChanged,
  onSent,
}: DoctorConversationChatModalProps) {
  return (
    <DoctorModal
      open={conversationId != null}
      onClose={onClose}
      title={
        <DoctorModalStackedTitle
          label="Сообщение"
          patientName={displayName || '—'}
          patientHref={patientUserId ? patientCardHref(patientUserId) : null}
          patientOnSupport={patientOnSupport}
        />
      }
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
