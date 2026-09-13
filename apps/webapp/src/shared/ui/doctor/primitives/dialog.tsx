'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import {
  Dialog as SharedDialog,
  DialogClose as SharedDialogClose,
  DialogContent as SharedDialogContent,
  DialogDescription as SharedDialogDescription,
  DialogFooter as SharedDialogFooter,
  DialogHeader as SharedDialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle as SharedDialogTitle,
  DialogTrigger as SharedDialogTrigger,
} from '@/shared/ui/primitives/dialog';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { DrawerContent } from './drawer';
import { useIsMobileViewport } from './useIsMobileViewport';
import { useDoctorModalOverlay } from '@/shared/ui/doctor/DoctorModalLayerContext';

type DoctorDialogContextValue = {
  isMobile: boolean;
  showRootOverlay: boolean;
};

const DoctorDialogMobileContext = React.createContext<DoctorDialogContextValue>({
  isMobile: false,
  showRootOverlay: true,
});

type DoctorDialogProps = DialogPrimitive.Root.Props & {
  /**
   * `DoctorModal` регистрирует слой в стеке сам и передаёт готовый `showOverlay` в `DialogContent`.
   * Тогда обёртка обязана промолчать: два слоя на одну модалку — это ситуация «подо мной уже есть
   * затемняющий слой», и модалка перестаёт затемнять фон вообще.
   */
  ownsLayer?: boolean;
};

function Dialog({ ownsLayer = true, ...props }: DoctorDialogProps) {
  const isMobile = useIsMobileViewport();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(Boolean(props.defaultOpen));
  const currentOpen = props.open ?? uncontrolledOpen;
  // Обычный диалог всегда накрывает страницу: затемняет он или нет — решает общий стек слоёв.
  const showRootOverlay = useDoctorModalOverlay(currentOpen && ownsLayer, 'backdrop');
  const { onOpenChange, ...rootProps } = props;

  const handleOpenChange = (open: boolean, details: DialogPrimitive.Root.ChangeEventDetails) => {
    if (props.open === undefined) setUncontrolledOpen(open);
    onOpenChange?.(open, details);
  };

  if (!isMobile) {
    return (
      <DoctorDialogMobileContext.Provider value={{ isMobile: false, showRootOverlay }}>
        <SharedDialog {...rootProps} onOpenChange={handleOpenChange} />
      </DoctorDialogMobileContext.Provider>
    );
  }

  const { actionsRef, handle, children, ...drawerProps } = rootProps;
  void handle;

  return (
    <DoctorDialogMobileContext.Provider value={{ isMobile: true, showRootOverlay }}>
      <DrawerPrimitive.Root
        {...drawerProps}
        actionsRef={actionsRef as React.RefObject<DrawerPrimitive.Root.Actions | null> | undefined}
        onOpenChange={(open, details) =>
          handleOpenChange(open, details as unknown as DialogPrimitive.Root.ChangeEventDetails)
        }
        swipeDirection="down"
      >
        {children}
      </DrawerPrimitive.Root>
    </DoctorDialogMobileContext.Provider>
  );
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  const { isMobile } = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogTrigger {...props} />;

  const { handle, ...drawerProps } = props;
  void handle;
  return (
    <DrawerPrimitive.Trigger
      {...(drawerProps as DrawerPrimitive.Trigger.Props)}
      data-slot="dialog-trigger"
    />
  );
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  const { isMobile } = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogClose {...props} />;
  return (
    <DrawerPrimitive.Close {...(props as DrawerPrimitive.Close.Props)} data-slot="dialog-close" />
  );
}

type DialogContentProps = React.ComponentProps<typeof SharedDialogContent> & {
  fullScreen?: boolean;
};

function DialogContent({
  className,
  children,
  showCloseButton = true,
  showOverlay,
  fullScreen = false,
  ...props
}: DialogContentProps) {
  const { isMobile, showRootOverlay } = React.useContext(DoctorDialogMobileContext);
  const effectiveShowOverlay = showOverlay ?? showRootOverlay;

  if (!isMobile) {
    return (
      <SharedDialogContent
        className={cn(
          className,
          fullScreen &&
            '!inset-0 !h-dvh !max-h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 !rounded-none',
        )}
        showCloseButton={showCloseButton}
        showOverlay={effectiveShowOverlay}
        forceOverlay
        {...props}
      >
        {children}
      </SharedDialogContent>
    );
  }

  return (
    <DrawerContent
      {...(props as React.ComponentProps<typeof DrawerContent>)}
      showCloseButton={false}
      showOverlay={effectiveShowOverlay}
      showHandle={!fullScreen}
      className={cn(
        className,
        fullScreen
          ? '!h-dvh !max-h-dvh rounded-none border-0 bg-black p-0'
          : '!h-[calc(100dvh-3.5rem)] !max-h-[calc(100dvh-3.5rem)] gap-4 overflow-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>[data-slot=drawer-content]]:overflow-y-auto',
      )}
    >
      {children}
    </DrawerContent>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const { isMobile } = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogHeader className={className} {...props} />;
  return <div className={cn('flex shrink-0 flex-col gap-2', className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & { showCloseButton?: boolean }) {
  const { isMobile } = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) {
    return (
      <SharedDialogFooter className={className} showCloseButton={showCloseButton} {...props}>
        {children}
      </SharedDialogFooter>
    );
  }

  return (
    <div
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 border-t bg-muted/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogClose render={<Button variant="outline" />}>Закрыть</DialogClose>
      ) : null}
    </div>
  );
}

function DialogTitle(props: React.ComponentProps<typeof SharedDialogTitle>) {
  const { isMobile } = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogTitle {...props} />;
  return <DrawerPrimitive.Title {...(props as DrawerPrimitive.Title.Props)} />;
}

function DialogDescription(props: React.ComponentProps<typeof SharedDialogDescription>) {
  const { isMobile } = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogDescription {...props} />;
  return <DrawerPrimitive.Description {...(props as DrawerPrimitive.Description.Props)} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
