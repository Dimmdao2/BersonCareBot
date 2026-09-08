import { cn } from '@/lib/utils';
import { patientBodyTextClass } from '@/shared/ui/patient/patientVisual';

/** Shared geometry for patient support chat and exercise comments. */
export const patientChatBubbleRowClass = 'flex w-full max-w-full items-end';

export const patientChatBubbleClass =
  cn(
    'relative min-w-0 w-fit max-w-[var(--patient-chat-bubble-max-width)] rounded-[var(--patient-chat-bubble-radius)] border px-3 py-2 shadow-sm',
    patientBodyTextClass,
  );

export const patientChatMetaWidthClass = 'max-w-[var(--patient-chat-bubble-max-width)]';
