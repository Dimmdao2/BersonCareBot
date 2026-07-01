"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./primitives/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./primitives/sheet";
import { useIsMobileViewport } from "./primitives/useIsMobileViewport";

type DoctorModalSize = "sm" | "md" | "lg" | "content";

/** Десктоп: ограничение ширины по размеру. Мобила — всегда bottom-sheet во всю ширину. */
const sizeMaxWidth: Record<DoctorModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-2xl",
  content: "sm:max-w-3xl",
};

type DoctorModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: DoctorModalSize;
  /** Опциональный слот кнопок-действий (закреплён внизу). */
  footer?: ReactNode;
  /** Доп. классы на прокручиваемое тело (например, убрать паддинги). */
  bodyClassName?: string;
};

/**
 * Канонический контейнер-модалка доктора.
 *
 * — Шапка со сменным заголовком + закрытие, закреплена сверху.
 * — Тело прокручивается ВНУТРИ; сама модалка НЕ растёт и НЕ вылезает за экран
 *   (высота ограничена с приятными отступами сверху/снизу).
 * — Опциональный подвал с кнопками, закреплён снизу.
 * — Размеры sm/md/lg/content (content = широкая+высокая, под чат и обсуждения).
 * — Десктоп: по центру, ограничение по ширине. Мобила: bottom-sheet снизу.
 *
 * size="content" отдаёт телу гибкую flex-колонку под контент со СВОИМ внутренним
 * скроллом (чат, панель обсуждений); остальные размеры прокручивают тело сами.
 */
export function DoctorModal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  footer,
  bodyClassName,
}: DoctorModalProps) {
  const isMobile = useIsMobileViewport();
  const isContent = size === "content";

  const body = (
    <div
      className={cn(
        "min-h-0 flex-1",
        isContent
          ? "flex flex-col overflow-hidden px-4 pt-3 pb-4"
          : "overflow-y-auto px-4 pt-3 pb-4",
        bodyClassName,
      )}
    >
      {children}
    </div>
  );

  const footerNode = footer ? (
    <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border/60 bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end">
      {footer}
    </div>
  ) : null;

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton
          className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-xl p-0"
        >
          <SheetHeader className="shrink-0 border-b border-border/60 px-4 pt-4 pb-3 pr-12">
            <SheetTitle>{title}</SheetTitle>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </SheetHeader>
          {body}
          {footerNode}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className={cn(
          "flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0",
          sizeMaxWidth[size],
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pt-4 pb-3 pr-12">
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>
        {body}
        {footerNode}
      </DialogContent>
    </Dialog>
  );
}
