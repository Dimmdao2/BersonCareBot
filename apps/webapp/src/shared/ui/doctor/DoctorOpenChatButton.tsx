'use client';

import dynamic from 'next/dynamic';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';

const DoctorClientEmbeddedChat = dynamic(
  () =>
    import('@/app/app/doctor/clients/DoctorClientEmbeddedChat').then(
      (mod) => mod.DoctorClientEmbeddedChat,
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
  /** Optional button label/content override (default: «Открыть чат»). */
  children?: ReactNode;
};

/**
 * Универсальная кнопка «Открыть чат» + модалка с чистой перепиской клиента.
 *
 * Открывает переписку в модалке БЕЗ ухода со страницы — годится для Заявок и карточки
 * пациента. `DoctorClientEmbeddedChat` — отдельный `next/dynamic` chunk, грузится только
 * после открытия модалки (статический import тянул ChatView в parser bundle родительских страниц).
 */
export function DoctorOpenChatButton({
  patientUserId,
  patientName,
  variant = 'outline',
  size = 'sm',
  className,
  disabled,
  title,
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
      <DoctorModal
        open={open}
        onClose={() => setOpen(false)}
        title={patientName ? `Переписка · ${patientName}` : 'Переписка'}
        size="content"
      >
        {open ? <DoctorClientEmbeddedChat patientUserId={patientUserId} /> : null}
      </DoctorModal>
    </>
  );
}
