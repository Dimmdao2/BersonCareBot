'use client';

import {
  createContext,
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDoctorFioShortLabel } from '@/shared/lib/fio';
import { DoctorPatientName } from './DoctorSupportStar';
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
/**
 * `fullscreen-text` — canonical single-field long-text editor (MODAL-TEXT-01..08): on mobile it
 * covers the whole visible viewport with no drawer handle/top gap; on desktop it is a no-op and
 * falls back to the standard dialog/right-sheet geometry with top-oriented text entry.
 */
type DoctorModalPresentation = 'standard' | 'fullscreen-media' | 'fullscreen-text';
export type DoctorModalDesktopPresentation = 'dialog' | 'right-sheet';

type FullscreenTextViewportGeometry = { top: number; height: number };

/**
 * MODAL-TEXT-05/06: geometry для мобильного fullscreen-текстового редактора. Следит за
 * `window.visualViewport` (высота и смещение верхнего края), пока редактор открыт, и отписывается
 * при закрытии/размонтировании. Без `visualViewport` (SSR, старый браузер) возвращает `null` —
 * тогда caller использует безопасный `100dvh`-fallback через className.
 */
function useDoctorModalFullscreenTextGeometry(
  active: boolean,
): FullscreenTextViewportGeometry | null {
  const [geometry, setGeometry] = useState<FullscreenTextViewportGeometry | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => setGeometry({ top: viewport.offsetTop, height: viewport.height });
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      // Deactivation (close/unmount) drops the live reading — caller falls back to className.
      setGeometry(null);
    };
  }, [active]);

  return geometry;
}

/**
 * MODAL-TEXT-04/06: единственное безрамочное поле однополевого fullscreen-редактора. Заполняет
 * всю доступную высоту между шапкой и footer (прокручивается само поле, не модалка) и получает
 * фокус сразу при монтировании — не дожидаясь завершения открывающей анимации слоя.
 */
export function DoctorModalTextEditorField({
  value,
  onChange,
  placeholder,
  className,
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Caller opts out only when it owns focus itself (default: focus on mount). */
  autoFocus?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (!autoFocus) return;
    textareaRef.current?.focus();
  }, [autoFocus]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={cn(
        'h-full min-h-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-white p-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0',
        className,
      )}
    />
  );
}

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
  patientOnSupport = false,
  patientVariant = 'link',
  entityClassName,
}: {
  label: ReactNode;
  entity?: ReactNode;
  patientName?: string | null;
  patientHref?: string | null;
  patientOnSupport?: boolean;
  /** Patient-card context does not need a link back to the page already underneath the modal. */
  patientVariant?: 'link' | 'context';
  entityClassName?: string;
}) {
  const patientClassName = cn(
    doctorModalTitleClass,
    'min-w-0 truncate text-right text-[15px] font-semibold',
    patientVariant === 'context' ? 'text-foreground' : 'text-primary',
  );
  const patientLabel = patientName ? formatDoctorFioShortLabel(patientName) : null;

  return (
    <span className="flex w-full min-w-0 flex-col items-start gap-1 text-left">
      <span className="flex w-full min-w-0 items-baseline justify-between gap-3">
        <span>{label}</span>
        {patientLabel ? (
          <DoctorPatientName
            isOnSupport={patientOnSupport}
            className={patientClassName}
            style={{ maxWidth: '55%' }}
            nameClassName="block"
          >
            {patientHref && patientVariant === 'link' ? (
              <Link
                href={patientHref}
                className="block truncate underline decoration-1 underline-offset-2"
                onClick={(event) => {
                  const target = new URL(patientHref, window.location.href);
                  if (target.pathname !== window.location.pathname) return;
                  event.preventDefault();
                  window.location.assign(target.href);
                }}
              >
                {patientLabel}
              </Link>
            ) : (
              patientLabel
            )}
          </DoctorPatientName>
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
  const isFullscreenText = presentation === 'fullscreen-text';
  const fullscreenTextGeometry = useDoctorModalFullscreenTextGeometry(
    isFullscreenText && isMobile && open,
  );
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

  // MODAL-TEXT-04: wrapper never scrolls itself — it is a plain flex column filling the space
  // between header and footer, so the sole textarea inside is the only scroll owner.
  const fullscreenTextBody = (
    <div ref={bodyRef} className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', bodyClassName)}>
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
        {!isMobile ? (
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
        ) : null}
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
              showHandle
              showOverlay={showOverlay}
              className="doctor-fullscreen-media-drawer !h-dvh !max-h-dvh gap-0 rounded-none border-0 bg-black p-0 shadow-none"
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

  if (isMobile && isFullscreenText) {
    // MODAL-TEXT-02/05: no top gap, no rounded corners, no drawer handle — the editor fills the
    // whole visible viewport. Geometry prefers live `visualViewport` (keyboard-aware) and falls
    // back to a safe `100dvh` when it is unavailable.
    const geometryStyle: CSSProperties | undefined = fullscreenTextGeometry
      ? {
          position: 'fixed',
          top: fullscreenTextGeometry.top,
          height: fullscreenTextGeometry.height,
          left: 0,
          right: 0,
        }
      : undefined;

    return (
      <DoctorModalLayerProvider depth={layerDepth}>
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent
            showCloseButton={false}
            showHandle={false}
            showOverlay={showOverlay}
            style={geometryStyle}
            className="h-dvh max-h-dvh translate-y-0 gap-0 rounded-none border-0 bg-card p-0 shadow-none"
          >
            <DrawerHeader className="shrink-0 border-b border-border/60 px-4 pb-3 pt-[calc(0.375rem+env(safe-area-inset-top,0px))]">
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
            {fullscreenTextBody}
            {footerNode}
          </DrawerContent>
        </Drawer>
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
