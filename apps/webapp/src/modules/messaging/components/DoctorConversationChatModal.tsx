'use client';

import { DoctorModal, DoctorModalStackedTitle } from '@/shared/ui/doctor/DoctorModal';
import { patientCardHref } from '@/app/app/doctor/patients/patientCardHref';
import { DoctorChatPanel } from './DoctorChatPanel';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type { SerializedSupportMessage } from '@/modules/messaging/serializeSupportMessage';

type DoctorConversationChatModalProps = {
  conversationId: string | null;
  displayName: string;
  patientUserId?: string | null;
  patientOnSupport?: boolean;
  open?: boolean;
  initialMessages?: SerializedSupportMessage[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
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
  open,
  initialMessages,
  loading = false,
  error = null,
  onRetry,
  onClose,
  onReadStateChanged,
  onSent,
}: DoctorConversationChatModalProps) {
  return (
    <DoctorModal
      open={open ?? conversationId != null}
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
      {loading ? (
        <DoctorPanelLoading className="min-h-[18rem]" />
      ) : error ? (
        <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Повторить
            </Button>
          ) : null}
        </div>
      ) : conversationId ? (
        <DoctorChatPanel
          key={conversationId}
          conversationId={conversationId}
          initialMessages={initialMessages}
          className="min-h-0 flex-1"
          onReadStateChanged={onReadStateChanged}
          onSent={onSent}
        />
      ) : null}
    </DoctorModal>
  );
}
