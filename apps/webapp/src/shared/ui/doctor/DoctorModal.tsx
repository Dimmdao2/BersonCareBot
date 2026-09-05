'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './primitives/button';
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
  DoctorModalLayerProvider,
  useDoctorModalLayer,
  useDoctorModalOverlay,
} from '@/shared/ui/doctor/DoctorModalLayerContext';
import {
  doctorModalEntityTitleClass,
  doctorModalTitleClass,
  doctorModalTitleSubjectClass,
  doctorSectionTitleClass,
} from '@/shared/ui/doctor/doctorVisual';

/**
 * Единая нижняя панель действий модалки: одинаковая геометрия, safe area и равные
 * по ширине кнопки на mobile. Живёт здесь, чтобы у экранов не появлялось локальных копий.
 */
const doctorModalFooterBarClass =
  'grid shrink-0 grid-flow-col auto-cols-fr gap-2 border-t border-border/60 bg-muted/30 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] [&>*]:min-w-0 [&>*]:w-full max-sm:[&>div]:contents max-sm:[&>div>*]:w-full sm:flex sm:justify-end sm:[&>*]:w-auto';

type DoctorModalFooterSlot = {
  container: HTMLElement | null;
  setHasContent: (value: boolean) => void;
};

const DoctorModalFooterSlotContext = createContext<DoctorModalFooterSlot | null>(null);

/**
 * Действия из содержимого модалки, отрисованные в её закреплённом футере.
 *
 * Нужен там, где набор кнопок знает только контент (режимы «детали / форма»), а футером
 * владеет модалка-хозяин: контент объявляет действия, панель остаётся общей. Вне `DoctorModal`
 * (например, в тестах компонента) рендерится на месте той же панелью.
 */
export function DoctorModalFooter({ children }: { children: ReactNode }) {
  const slot = useContext(DoctorModalFooterSlotContext);
  const setHasContent = slot?.setHasContent;

  useLayoutEffect(() => {
    if (!setHasContent) return;
    setHasContent(true);
    return () => setHasContent(false);
  }, [setHasContent]);

  if (!slot) return <div className={doctorModalFooterBarClass}>{children}</div>;
  if (!slot.container) return null;
  return createPortal(children, slot.container);
}

type DoctorModalSize = 'sm' | 'md' | 'lg' | 'content';
type DoctorModalBodyVariant = 'default' | 'list';
type DoctorModalPresentation = 'standard' | 'fullscreen-media';
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
  /**
   * Вторая строка шапки под заголовком: контекст модалки («Пациент: Фамилия Имя»).
   * Общий контракт — размер/начертание задаёт `doctorModalTitleSubjectClass`, не caller.
   */
  titleSubject?: ReactNode;
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
  /** Второй и последующие слои стека не добавляют новое затемнение поверх первого. */
  nested?: boolean;
  /** Called before a non-modal right sheet closes from a pointer press outside it. */
  onRightSheetOutsidePress?: () => void;
  /** Full-viewport media viewer which keeps the underlying modal mounted. */
  presentation?: DoctorModalPresentation;
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

/** Two-row modal title: modal kind + patient on top, entity name below. */
export function DoctorModalStackedTitle({
  label,
  entity,
  patientName,
  patientHref,
  entityClassName,
}: {
  label: ReactNode;
  entity?: ReactNode;
  patientName?: ReactNode;
  patientHref?: string | null;
  entityClassName?: string;
}) {
  const patientClassName = cn(
    doctorModalTitleClass,
    'min-w-0 truncate text-right text-sm text-primary',
  );

  return (
    <span className="flex w-full min-w-0 flex-col items-start gap-1 text-left">
      <span className="flex w-full min-w-0 items-baseline justify-between gap-3">
        <span>{label}</span>
        {patientName ? (
          patientHref ? (
            <Link
              href={patientHref}
              className={cn(patientClassName, 'underline decoration-1 underline-offset-2')}
              style={{ maxWidth: '55%' }}
              onClick={(event) => {
                const target = new URL(patientHref, window.location.href);
                if (target.pathname !== window.location.pathname) return;
                event.preventDefault();
                window.location.assign(target.href);
              }}
            >
              {patientName}
            </Link>
          ) : (
            <span className={patientClassName} style={{ maxWidth: '55%' }}>
              {patientName}
            </span>
          )
        ) : null}
      </span>
      {entity ? (
        <span className={cn(doctorModalEntityTitleClass, entityClassName)}>{entity}</span>
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
  titleSubject,
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
  nested = false,
  onRightSheetOutsidePress,
  presentation = 'standard',
}: DoctorModalProps) {
  const isMobile = useIsMobileViewport();
  const { isNestedLayer, parentDepth } = useDoctorModalLayer(nested);
  const showOverlay = useDoctorModalOverlay(open, isNestedLayer);
  const isWideDesktop = useViewportMinWidth(1280);
  const isContent = size === 'content';
  const isListBody = bodyVariant === 'list';
  const [rightSheetWidth, setRightSheetWidth] = useState<string | null>(null);
  const [footerSlotElement, setFooterSlotElement] = useState<HTMLDivElement | null>(null);
  const [hasSlottedFooter, setHasSlottedFooter] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerSlot = useMemo<DoctorModalFooterSlot>(
    () => ({ container: footerSlotElement, setHasContent: setHasSlottedFooter }),
    [footerSlotElement],
  );

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
      <DoctorModalFooterSlotContext.Provider value={footerSlot}>
        {children}
      </DoctorModalFooterSlotContext.Provider>
    </div>
  );

  const hasFooter = Boolean(footer) || hasSlottedFooter;
  const footerNode = (
    <div
      ref={setFooterSlotElement}
      className={cn(doctorModalFooterBarClass, !hasFooter && 'hidden')}
    >
      {footer}
    </div>
  );

  const mobileSafeAreaNode = hasFooter ? null : (
    <div aria-hidden="true" className="h-[env(safe-area-inset-bottom,0px)] shrink-0 bg-card" />
  );

  const bodyHeaderNode = bodyHeader ? (
    <div className="shrink-0 border-b border-border/60 bg-card">{bodyHeader}</div>
  ) : null;

  const titleSubjectNode = titleSubject ? (
    <p className={doctorModalTitleSubjectClass}>{titleSubject}</p>
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

  const layerDepth = parentDepth + (open ? 1 : 0);

  if (presentation === 'fullscreen-media') {
    const fullscreenBody = (
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-black text-white">
        <div className="doctor-fullscreen-media-close pointer-events-none absolute z-10">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="pointer-events-auto size-10 rounded-full border-white/20 bg-black/55 text-white hover:bg-black/70 hover:text-white"
            onClick={onClose}
            aria-label="Закрыть видео"
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>
        <div className="sr-only">{title}</div>
        {children}
      </div>
    );

    if (isMobile) {
      return (
        <DoctorModalLayerProvider depth={layerDepth}>
          <Drawer open={open} onOpenChange={handleOpenChange}>
            <DrawerContent
              showCloseButton={false}
              showHandle={false}
              showOverlay={showOverlay}
              className="!h-dvh !max-h-dvh gap-0 rounded-none border-0 bg-black p-0 shadow-none"
            >
              <DrawerTitle className="sr-only">{title}</DrawerTitle>
              {fullscreenBody}
            </DrawerContent>
          </Drawer>
        </DoctorModalLayerProvider>
      );
    }

    return (
      <DoctorModalLayerProvider depth={layerDepth}>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent
            fullScreen
            showCloseButton={false}
            showOverlay={showOverlay}
            className="flex bg-black p-0 shadow-none"
          >
            <DialogTitle className="sr-only">{title}</DialogTitle>
            {fullscreenBody}
          </DialogContent>
        </Dialog>
      </DoctorModalLayerProvider>
    );
  }

  if (isMobile) {
    return (
      <DoctorModalLayerProvider depth={layerDepth}>
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent
            showCloseButton={false}
            showOverlay={showOverlay}
            className="gap-0 bg-card p-0"
          >
            <DrawerHeader className="shrink-0 border-b border-border/60 px-4 pt-1.5 pb-3">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <DrawerTitle className={doctorModalTitleClass}>{title}</DrawerTitle>
                  {titleSubjectNode}
                </div>
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
      </DoctorModalLayerProvider>
    );
  }

  if (desktopPresentation === 'right-sheet') {
    return (
      <DoctorModalLayerProvider depth={layerDepth}>
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
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <SheetTitle className={doctorModalTitleClass}>{title}</SheetTitle>
                  {titleSubjectNode}
                </div>
                {headerTrailingNode}
              </div>
              {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
            </SheetHeader>
            {bodyHeaderNode}
            {body}
            {footerNode}
          </SheetContent>
        </Sheet>
      </DoctorModalLayerProvider>
    );
  }

  return (
    <DoctorModalLayerProvider depth={layerDepth}>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton
          showOverlay={showOverlay}
          className={cn(
            'flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden bg-card p-0',
            sizeMaxWidth[size],
          )}
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 pt-4 pb-3 pr-12">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <DialogTitle className={doctorModalTitleClass}>{title}</DialogTitle>
                {titleSubjectNode}
              </div>
              {headerTrailingNode}
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </DialogHeader>
          {bodyHeaderNode}
          {body}
          {footerNode}
        </DialogContent>
      </Dialog>
    </DoctorModalLayerProvider>
  );
}
