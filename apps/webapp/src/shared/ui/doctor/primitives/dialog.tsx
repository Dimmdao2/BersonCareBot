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

const DoctorDialogMobileContext = React.createContext(false);

function Dialog(props: DialogPrimitive.Root.Props) {
  const isMobile = useIsMobileViewport();

  if (!isMobile) {
    return (
      <DoctorDialogMobileContext.Provider value={false}>
        <SharedDialog {...props} />
      </DoctorDialogMobileContext.Provider>
    );
  }

  const { actionsRef, handle, onOpenChange, children, ...drawerProps } = props;
  void handle;

  return (
    <DoctorDialogMobileContext.Provider value>
      <DrawerPrimitive.Root
        {...drawerProps}
        actionsRef={actionsRef as React.RefObject<DrawerPrimitive.Root.Actions | null> | undefined}
        onOpenChange={(open, details) =>
          onOpenChange?.(open, details as unknown as DialogPrimitive.Root.ChangeEventDetails)
        }
        swipeDirection="down"
      >
        {children}
      </DrawerPrimitive.Root>
    </DoctorDialogMobileContext.Provider>
  );
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  const isMobile = React.useContext(DoctorDialogMobileContext);
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
  const isMobile = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogClose {...props} />;
  return (
    <DrawerPrimitive.Close {...(props as DrawerPrimitive.Close.Props)} data-slot="dialog-close" />
  );
}

type DialogContentProps = React.ComponentProps<typeof SharedDialogContent>;

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  const isMobile = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) {
    return (
      <SharedDialogContent className={className} showCloseButton={showCloseButton} {...props}>
        {children}
      </SharedDialogContent>
    );
  }

  return (
    <DrawerContent
      {...(props as React.ComponentProps<typeof DrawerContent>)}
      showCloseButton={false}
      className={cn(
        className,
        '!h-[calc(100dvh-3.5rem)] !max-h-[calc(100dvh-3.5rem)] gap-4 overflow-hidden p-4 pb-[max(1rem,env(safe-area-inset-bottom))] [&>[data-slot=drawer-content]]:overflow-y-auto',
      )}
    >
      {children}
    </DrawerContent>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  const isMobile = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogHeader className={className} {...props} />;
  return <div className={cn('flex shrink-0 flex-col gap-2', className)} {...props} />;
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & { showCloseButton?: boolean }) {
  const isMobile = React.useContext(DoctorDialogMobileContext);
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
  const isMobile = React.useContext(DoctorDialogMobileContext);
  if (!isMobile) return <SharedDialogTitle {...props} />;
  return <DrawerPrimitive.Title {...(props as DrawerPrimitive.Title.Props)} />;
}

function DialogDescription(props: React.ComponentProps<typeof SharedDialogDescription>) {
  const isMobile = React.useContext(DoctorDialogMobileContext);
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
