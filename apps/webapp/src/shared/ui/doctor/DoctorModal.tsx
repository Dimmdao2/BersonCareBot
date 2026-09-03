'use client';

import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './primitives/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from './primitives/drawer';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './primitives/sheet';
import { useIsMobileViewport } from './primitives/useIsMobileViewport';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import {
  doctorModalEntityTitleClass,
  doctorModalTitleClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';

type DoctorModalSize = 'sm' | 'md' | 'lg' | 'content';
type DoctorModalBodyVariant = 'default' | 'list';
export type DoctorModalDesktopPresentation = 'dialog' | 'right-sheet';

/** Десктоп: ограничение ширины по размеру. Мобила — всегда bottom-sheet во всю ширину. */
const sizeMaxWidth: Record<DoctorModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  content: 'sm:max-w-3xl',
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
  /** Optional icon action in the modal header. */
  headerAction?: ReactNode;
  /** Standard secondary heading aligned to the right of the modal title. */
  headerSubtitle?: ReactNode;
  /** Закреплённый блок между системной шапкой и прокручиваемым телом. */
  bodyHeader?: ReactNode;
  /** Доп. классы на прокручиваемое тело (например, убрать паддинги). */
  bodyClassName?: string;
  /** A flat list owns no local scroll or card chrome: the modal body is its only scroll owner. */
  bodyVariant?: DoctorModalBodyVariant;
  /** Desktop/tablet presentation. Mobile always uses the canonical bottom drawer. */
  desktopPresentation?: DoctorModalDesktopPresentation;
  /** Called before a non-modal right sheet closes from a pointer press outside it. */
  onRightSheetOutsidePress?: () => void;
};

export function DoctorModalCompositeTitle({
  label,
  entity,
}: {
  label: ReactNode;
  entity?: ReactNode;
}) {
  return (
    <span className="line-clamp-2">
      <span>{label}</span>
      {entity ? (
        <>
          {': '}
          <span className={doctorModalEntityTitleClass}>{entity}</span>
        </>
      ) : null}
    </span>
  );
}

/**
 * Канонический контейнер-модалка доктора.
 *
 * — Шапка со сменным заголовком + закрытие, закреплена сверху.
 * — Тело прокручивается ВНУТРИ; сама модалка НЕ растёт и НЕ вылезает за экран
 *   (высота ограничена с приятными отступами сверху/снизу).
 * — Опциональный подвал с кнопками, закреплён снизу.
 * — Размеры sm/md/lg/content (content = широкая+высокая, под чат и обсуждения).
 * — Десктоп/планшет: диалог по центру либо единая правая панель без затемнения.
 * — Мобила: bottom-sheet снизу.
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
  size = 'md',
  footer,
  headerAction,
  headerSubtitle,
  bodyHeader,
  bodyClassName,
  bodyVariant = 'default',
  desktopPresentation = 'dialog',
  onRightSheetOutsidePress,
}: DoctorModalProps) {
  const isMobile = useIsMobileViewport();
  const isWideDesktop = useViewportMinWidth(1280);
  const isContent = size === 'content';
  const isListBody = bodyVariant === 'list';
  const [rightSheetWidth, setRightSheetWidth] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [open]);

  useLayoutEffect(() => {
    if (!open || isMobile || desktopPresentation !== 'right-sheet') return;

    const pageContent = document.getElementById('app-shell-content');
    if (!pageContent) return;

    const updateGeometry = () => {
      const rect = pageContent.getBoundingClientRect();
      const widthRatio = isWideDesktop ? 0.5 : 0.45;
      const nextWidth = `calc(${rect.width * widthRatio}px + 0.375rem)`;
      setRightSheetWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updateGeometry();
    window.addEventListener('resize', updateGeometry);
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateGeometry);
    resizeObserver?.observe(pageContent);
    return () => {
      window.removeEventListener('resize', updateGeometry);
      resizeObserver?.disconnect();
    };
  }, [desktopPresentation, isMobile, isWideDesktop, open]);

  const body = (
    <div
      ref={bodyRef}
      className={cn(
        'min-h-0 flex-1',
        isListBody
          ? 'overflow-y-auto p-0'
          : isContent
            ? 'flex flex-col overflow-hidden px-4 pt-3 pb-4'
            : 'overflow-y-auto px-4 pt-3 pb-4',
        bodyClassName,
      )}
    >
      {children}
    </div>
  );

  const footerNode = footer ? (
    <div className="grid shrink-0 grid-flow-col auto-cols-fr gap-2 border-t border-border/60 bg-muted/30 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] [&>*]:min-w-0 [&>*]:w-full max-sm:[&>div]:contents max-sm:[&>div>*]:w-full sm:flex sm:justify-end sm:[&>*]:w-auto">
      {footer}
    </div>
  ) : null;

  const mobileSafeAreaNode = footer ? null : (
    <div aria-hidden="true" className="h-[env(safe-area-inset-bottom,0px)] shrink-0 bg-card" />
  );

  const bodyHeaderNode = bodyHeader ? (
    <div className="shrink-0 border-b border-border/60 bg-card">{bodyHeader}</div>
  ) : null;

  const headerTrailingNode =
    headerSubtitle || headerAction ? (
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        {headerSubtitle ? (
          <div className={cn(doctorSectionTitleClass, 'whitespace-nowrap text-right')}>
            {headerSubtitle}
          </div>
        ) : null}
        {headerAction}
      </div>
    ) : null;

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent showCloseButton={false} className="gap-0 bg-card p-0">
          <DrawerHeader className="shrink-0 border-b border-border/60 px-4 pt-1.5 pb-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <DrawerTitle className={doctorModalTitleClass}>{title}</DrawerTitle>
              {headerTrailingNode}
            </div>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {bodyHeaderNode}
          {body}
          {footerNode}
          {mobileSafeAreaNode}
        </DrawerContent>
      </Drawer>
    );
  }

  if (desktopPresentation === 'right-sheet') {
    return (
      <Sheet
        open={open}
        modal={false}
        onOpenChange={(nextOpen, eventDetails) => {
          if (!nextOpen && eventDetails.reason === 'outside-press') {
            onRightSheetOutsidePress?.();
          }
          handleOpenChange(nextOpen);
        }}
      >
        <SheetContent
          side="right"
          showOverlay={false}
          className="gap-0 bg-card p-0 !max-w-none !shadow-md"
          style={{
            top: 'var(--doctor-page-header-h, 2.75rem)',
            height: 'calc(100dvh - var(--doctor-page-header-h, 2.75rem))',
            right: 0,
            width:
              rightSheetWidth ??
              (isWideDesktop ? 'calc(50vw + 0.375rem)' : 'calc(45vw + 0.375rem)'),
            maxWidth: 'none',
          }}
        >
          <SheetHeader
            className="shrink-0 justify-center border-b border-border/60 px-4 py-1 pr-12"
            style={{ minHeight: 'var(--doctor-page-header-h, 2.75rem)' }}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <SheetTitle className={doctorModalTitleClass}>{title}</SheetTitle>
              {headerTrailingNode}
            </div>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </SheetHeader>
          {bodyHeaderNode}
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
          'flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden bg-card p-0',
          sizeMaxWidth[size],
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pt-4 pb-3 pr-12">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <DialogTitle className={doctorModalTitleClass}>{title}</DialogTitle>
            {headerTrailingNode}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </DialogHeader>
        {bodyHeaderNode}
        {body}
        {footerNode}
      </DialogContent>
    </Dialog>
  );
}
