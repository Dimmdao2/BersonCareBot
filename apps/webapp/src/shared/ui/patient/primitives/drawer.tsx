'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  patientBodyTextClass,
  patientMutedTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

/**
 * Канонический мобильный bottom-drawer patient-зоны.
 *
 * Ширина ограничена колонкой оболочки (430px) — так же, как портальные `Dialog`/`Sheet`
 * пациента в `app/styles/patient.css`; цвета берутся из `:root`-токенов, потому что портал
 * рендерится вне `#app-shell-patient`.
 */
function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" swipeDirection="down" {...props} />;
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  showOverlay = true,
  showHandle = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  /** Второй слой поверх уже затемнённого не затемняет экран ещё раз. */
  showOverlay?: boolean;
  /** Полноэкранное медиа прячет стандартную «ручку» drawer. */
  showHandle?: boolean;
}) {
  return (
    <DrawerPrimitive.Portal>
      {showOverlay ? (
        <DrawerPrimitive.Backdrop
          data-slot="drawer-overlay"
          className="fixed inset-0 z-50 bg-black/25 transition-opacity duration-300 ease-out [opacity:calc(1-var(--drawer-swipe-progress))] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 supports-backdrop-filter:backdrop-blur-[2px]"
        />
      ) : null}
      <DrawerPrimitive.Viewport className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            'pointer-events-auto relative flex h-[calc(100dvh-1.75rem)] max-h-[calc(100dvh-1.75rem)] w-full max-w-[min(100%,430px)] translate-y-[calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y))] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-[var(--patient-border)] bg-[var(--patient-card-bg)] bg-clip-padding shadow-lg transition-transform duration-300 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full data-swiping:duration-0',
            patientBodyTextClass,
            className,
          )}
          {...props}
        >
          {showHandle ? (
            <div
              aria-hidden="true"
              className="mx-auto mt-2.5 mb-1 h-1 w-10 shrink-0 rounded-full bg-[var(--patient-text-muted)]/45"
            />
          ) : null}
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </DrawerPrimitive.Content>
          {showCloseButton && (
            <DrawerPrimitive.Close
              data-slot="drawer-close"
              render={<Button variant="ghost" className="absolute top-3 right-3" size="icon-sm" />}
            >
              <XIcon />
              <span className="sr-only">Закрыть</span>
            </DrawerPrimitive.Close>
          )}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('flex flex-col gap-0.5 p-4', className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        patientSectionTitleClass,
        className,
      )}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn(patientMutedTextClass, className)}
      {...props}
    />
  );
}

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle };
