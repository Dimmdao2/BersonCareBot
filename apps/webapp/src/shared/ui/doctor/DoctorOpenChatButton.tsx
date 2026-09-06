'use client';

import dynamic from 'next/dynamic';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';

const DoctorPatientConversationChatModal = dynamic(
  () =>
    import('@/app/app/doctor/clients/DoctorPatientConversationChatModal').then(
      (mod) => mod.DoctorPatientConversationChatModal,
    ),
  { ssr: false },
);

type Props = {
  patientUserId: string;
  patientName?: string | null;
  variant?: ComponentProps<typeof Button>['variant'];
  size?: ComponentProps<typeof Button>['size'];
  className?: string;
  disabled?: boolean;
  title?: string;
  patientOnSupport?: boolean;
  onUnreadChange?: (count: number) => void;
  /** Optional button label/content override (default: «Открыть чат»). */
  children?: ReactNode;
};

/**
 * Универсальная кнопка «Открыть чат» + каноническая модалка переписки из «Коммуникаций».
 */
export function DoctorOpenChatButton({
  patientUserId,
  patientName,
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
  title,
  patientOnSupport = false,
  onUnreadChange,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={disabled}
        title={title}
        onClick={() => setOpen(true)}
      >
        {children ?? 'Открыть чат'}
      </Button>
      {open ? (
        <DoctorPatientConversationChatModal
          patientUserId={patientUserId}
          patientName={patientName || '—'}
          patientOnSupport={patientOnSupport}
          onUnreadChange={onUnreadChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
