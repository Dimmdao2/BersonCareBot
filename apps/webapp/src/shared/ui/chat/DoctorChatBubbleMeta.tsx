import { cn } from '@/lib/utils';
import type { ChatMessageDeliveryStatus } from '@/modules/messaging/chatMessageDeliveryStatus';
import { ChatMessageDeliveryTicks } from './ChatMessageDeliveryTicks';

type Props = {
  timeLabel: string;
  deliveryStatus?: ChatMessageDeliveryStatus | null;
  className?: string;
  appearance?: 'doctor' | 'patient';
};

/** Keeps long doctor messages visually anchored to their sender's side. */
export const DOCTOR_CHAT_BUBBLE_MAX_WIDTH = 'min(calc(100% - 2.5rem), 22rem)';

/** Compact timestamp embedded into the bottom-right corner of a doctor chat bubble. */
export function DoctorChatBubbleMeta({
  timeLabel,
  deliveryStatus,
  className,
  appearance = 'doctor',
}: Props) {
  return (
    <>
      <span
        aria-hidden
        className="inline-block h-0 align-baseline"
        style={{ width: deliveryStatus ? '3.25rem' : '2.25rem' }}
      />
      <span
        className={cn(
          'pointer-events-none',
          appearance === 'patient'
            ? 'patient-type-micro patient-text-muted-strong'
            : 'text-muted-foreground/65',
          className,
        )}
        style={{
          position: 'absolute',
          right: '0.55rem',
          bottom: '0.4rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '1px',
          fontFamily: appearance === 'doctor' ? 'Arial, Helvetica, sans-serif' : undefined,
          fontSize: appearance === 'doctor' ? '11px' : undefined,
          fontWeight: appearance === 'doctor' ? 400 : undefined,
          lineHeight: appearance === 'doctor' ? '12px' : undefined,
          whiteSpace: 'nowrap',
        }}
      >
        <span>{timeLabel}</span>
        {deliveryStatus ? (
          <ChatMessageDeliveryTicks status={deliveryStatus} className="size-3.5 text-primary" />
        ) : null}
      </span>
    </>
  );
}
