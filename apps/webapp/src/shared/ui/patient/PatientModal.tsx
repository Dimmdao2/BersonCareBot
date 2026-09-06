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
import { useIsMobileViewport } from './primitives/useIsMobileViewport';
import {
  PatientModalLayerProvider,
  usePatientModalLayer,
  usePatientModalOverlay,
} from '@/shared/ui/patient/PatientModalLayerContext';
import { patientSectionTitleClass } from '@/shared/ui/patient/patientVisual';

/**
 * Единая нижняя панель действий модалки: одинаковая геометрия, safe area и равные
 * по ширине кнопки на mobile. Живёт здесь, чтобы у экранов не появлялось локальных копий.
 */
const patientModalFooterBarClass =
  'grid shrink-0 grid-flow-col auto-cols-fr gap-2 border-t border-[var(--patient-border)] bg-[rgba(248,250,252,0.9)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] [&>*]:min-w-0 [&>*]:w-full max-sm:[&>div]:contents max-sm:[&>div>*]:w-full sm:flex sm:justify-end sm:[&>*]:w-auto';

type PatientModalFooterSlot = {
  container: HTMLElement | null;
  setHasContent: (value: boolean) => void;
};

const PatientModalFooterSlotContext = createContext<PatientModalFooterSlot | null>(null);

/**
 * Действия из содержимого модалки, отрисованные в её закреплённом футере.
 *
 * Нужен там, где набор кнопок знает только контент (ветки «нельзя редактировать / форма»), а
 * футером владеет модалка-хозяин. Вне `PatientModal` (например, в тестах компонента) рендерится
 * на месте той же панелью. Кнопка `submit` внутри формы связывается с ней атрибутом `form`,
 * потому что портал уносит её из DOM-дерева формы.
 */
export function PatientModalFooter({ children }: { children: ReactNode }) {
  const slot = useContext(PatientModalFooterSlotContext);
  const setHasContent = slot?.setHasContent;

  useLayoutEffect(() => {
    if (!setHasContent) return;
    setHasContent(true);
    return () => setHasContent(false);
  }, [setHasContent]);

  if (!slot) return <div className={patientModalFooterBarClass}>{children}</div>;
  if (!slot.container) return null;
  return createPortal(children, slot.container);
}

type PatientModalSize = 'sm' | 'md' | 'lg' | 'content';
type PatientModalBodyVariant = 'default' | 'list';
type PatientModalPresentation = 'standard' | 'fullscreen-media';

/** Десктоп: ограничение ширины по размеру. Мобила — всегда bottom-drawer. */
const sizeMaxWidth: Record<PatientModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  content: 'sm:max-w-3xl',
};

type PatientModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Вторая строка шапки под заголовком: контекст модалки (упражнение, клиника). */
  titleSubject?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: PatientModalSize;
  /** Опциональный слот кнопок-действий (закреплён внизу). */
  footer?: ReactNode;
  /** Иконочное действие в шапке модалки. */
  headerAction?: ReactNode;
  /** Закреплённый блок между шапкой и прокручиваемым телом. */
  bodyHeader?: ReactNode;
  /** Доп. классы на прокручиваемое тело (например, убрать паддинги). */
  bodyClassName?: string;
  /** Плоский список не имеет своего скролла и обвязки: тело модалки — единственный владелец скролла. */
  bodyVariant?: PatientModalBodyVariant;
  /** Второй и последующие слои стека не добавляют новое затемнение поверх первого. */
  nested?: boolean;
  /** Полноэкранный просмотр медиа, оставляющий нижнюю модалку смонтированной. */
  presentation?: PatientModalPresentation;
};

/**
 * Канонический контейнер-модалка пациента — единственный контейнер feature-модалок patient-зоны.
 *
 * — Шапка со сменным заголовком + закрытие, закреплена сверху.
 * — Тело прокручивается ВНУТРИ; сама модалка НЕ растёт и НЕ вылезает за экран.
 * — Опциональный подвал с кнопками, закреплён снизу, с safe-area.
 * — Размеры sm/md/lg/content (content = широкая+высокая, под чат и обсуждения).
 * — Десктоп: диалог по центру. Мобила: канонический bottom-drawer.
 * — Вложенные слои делят одно затемнение (см. {@link usePatientModalOverlay}).
 *
 * size="content" отдаёт телу гибкую flex-колонку под контент со СВОИМ внутренним
 * скроллом (чат, панель обсуждений); остальные размеры прокручивают тело сами.
 *
 * Изоляция зон (AGENTS.md §17): patient-модалки НЕ импортируют `shared/ui/doctor/**`.
 */
export function PatientModal({
  open,
  onClose,
  title,
  titleSubject,
  description,
  children,
  size = 'md',
  footer,
  headerAction,
  bodyHeader,
  bodyClassName,
  bodyVariant = 'default',
  nested = false,
  presentation = 'standard',
}: PatientModalProps) {
  const isMobile = useIsMobileViewport();
  const { isNestedLayer, parentDepth } = usePatientModalLayer(nested);
  const showOverlay = usePatientModalOverlay(open, isNestedLayer);
  const isContent = size === 'content';
  const isListBody = bodyVariant === 'list';
  const [footerSlotElement, setFooterSlotElement] = useState<HTMLDivElement | null>(null);
  const [hasSlottedFooter, setHasSlottedFooter] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerSlot = useMemo<PatientModalFooterSlot>(
    () => ({ container: footerSlotElement, setHasContent: setHasSlottedFooter }),
    [footerSlotElement],
  );

  useLayoutEffect(() => {
    if (!open || !bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [open]);

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
      <PatientModalFooterSlotContext.Provider value={footerSlot}>
        {children}
      </PatientModalFooterSlotContext.Provider>
    </div>
  );

  const hasFooter = Boolean(footer) || hasSlottedFooter;
  const footerNode = (
    <div
      ref={setFooterSlotElement}
      className={cn(patientModalFooterBarClass, !hasFooter && 'hidden')}
    >
      {footer}
    </div>
  );

  const mobileSafeAreaNode = hasFooter ? null : (
    <div
      aria-hidden="true"
      className="h-[env(safe-area-inset-bottom,0px)] shrink-0 bg-[var(--patient-card-bg)]"
    />
  );

  const bodyHeaderNode = bodyHeader ? (
    <div className="shrink-0 border-b border-[var(--patient-border)] bg-[var(--patient-card-bg)]">
      {bodyHeader}
    </div>
  ) : null;

  const titleSubjectNode = titleSubject ? (
    <p className="truncate text-xs text-[var(--patient-text-muted)]">{titleSubject}</p>
  ) : null;

  const headerTrailingNode = headerAction ? (
    <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">{headerAction}</div>
  ) : null;

  const handleOpenChange = (v: boolean) => {
    if (!v) onClose();
  };

  const layerDepth = parentDepth + (open ? 1 : 0);

  if (presentation === 'fullscreen-media') {
    const fullscreenBody = (
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col bg-black text-white">
        {!isMobile ? (
          <div className="patient-fullscreen-media-close pointer-events-none absolute z-10">
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="pointer-events-auto size-10 rounded-full border-white/20 bg-black/55 text-white hover:bg-black/70 hover:text-white"
              onClick={onClose}
              aria-label="Закрыть"
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
        <PatientModalLayerProvider depth={layerDepth}>
          <Drawer open={open} onOpenChange={handleOpenChange}>
            <DrawerContent
              showCloseButton={false}
              showHandle
              showOverlay={showOverlay}
              className="patient-fullscreen-media-drawer !h-dvh !max-h-dvh !max-w-full gap-0 rounded-none border-0 bg-black p-0 shadow-none"
            >
              <DrawerTitle className="sr-only">{title}</DrawerTitle>
              {fullscreenBody}
            </DrawerContent>
          </Drawer>
        </PatientModalLayerProvider>
      );
    }

    return (
      <PatientModalLayerProvider depth={layerDepth}>
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
      </PatientModalLayerProvider>
    );
  }

  if (isMobile) {
    return (
      <PatientModalLayerProvider depth={layerDepth}>
        <Drawer open={open} onOpenChange={handleOpenChange}>
          <DrawerContent
            showCloseButton={false}
            showOverlay={showOverlay}
            className="gap-0 bg-[var(--patient-card-bg)] p-0"
          >
            <DrawerHeader className="shrink-0 border-b border-[var(--patient-border)] px-4 pt-1.5 pb-3">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <DrawerTitle className={patientSectionTitleClass}>{title}</DrawerTitle>
                  {titleSubjectNode}
                </div>
                {headerTrailingNode}
              </div>
              {description ? <DrawerDescription>{description}</DrawerDescription> : null}
            </DrawerHeader>
            {bodyHeaderNode}
            {body}
            {footerNode}
            {mobileSafeAreaNode}
          </DrawerContent>
        </Drawer>
      </PatientModalLayerProvider>
    );
  }

  return (
    <PatientModalLayerProvider depth={layerDepth}>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton
          showOverlay={showOverlay}
          className={cn(
            'flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden border border-[var(--patient-border)] bg-[var(--patient-card-bg)] p-0',
            sizeMaxWidth[size],
          )}
        >
          <DialogHeader className="shrink-0 border-b border-[var(--patient-border)] px-4 pt-4 pb-3 pr-12">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <DialogTitle className={patientSectionTitleClass}>{title}</DialogTitle>
                {titleSubjectNode}
              </div>
              {headerTrailingNode}
            </div>
            {description ? (
              <p className="text-sm text-[var(--patient-text-muted)]">{description}</p>
            ) : null}
          </DialogHeader>
          {bodyHeaderNode}
          {body}
          {footerNode}
        </DialogContent>
      </Dialog>
    </PatientModalLayerProvider>
  );
}
