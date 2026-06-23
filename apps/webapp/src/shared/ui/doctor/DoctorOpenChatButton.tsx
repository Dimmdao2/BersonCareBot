"use client";

import { type ComponentProps, type ReactNode, useState } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DoctorModal } from "@/shared/ui/doctor/DoctorModal";
import { DoctorClientEmbeddedChat } from "@/app/app/doctor/clients/DoctorClientEmbeddedChat";

type Props = {
  patientUserId: string;
  patientName?: string | null;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
  disabled?: boolean;
  title?: string;
  /** Optional button label/content override (default: «Открыть чат»). */
  children?: ReactNode;
};

/**
 * Универсальная кнопка «Открыть чат» + модалка с чистой перепиской клиента.
 *
 * Открывает переписку (DoctorClientEmbeddedChat) в модалке БЕЗ ухода со страницы —
 * годится и для Заявок, и для карточки пациента. Чат монтируется ЛЕНИВО (только когда
 * модалка открыта), поэтому переписка не грузится, пока кнопку не нажали.
 */
export function DoctorOpenChatButton({
  patientUserId,
  patientName,
  variant = "outline",
  size = "sm",
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
        {children ?? "Открыть чат"}
      </Button>
      <DoctorModal
        open={open}
        onClose={() => setOpen(false)}
        title={patientName ? `Переписка · ${patientName}` : "Переписка"}
        size="lg"
      >
        {open ? <DoctorClientEmbeddedChat patientUserId={patientUserId} /> : null}
      </DoctorModal>
    </>
  );
}
