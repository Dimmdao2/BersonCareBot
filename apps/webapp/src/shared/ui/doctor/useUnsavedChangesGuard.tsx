'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/doctor/primitives/dialog';

export function useUnsavedChangesGuard({
  isDirty,
  guardPageExit = false,
}: {
  isDirty: boolean;
  guardPageExit?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requestAction = useCallback(
    (action: () => void) => {
      if (!isDirty) {
        action();
        return;
      }
      pendingActionRef.current = action;
      setDialogOpen(true);
    },
    [isDirty],
  );

  const returnToEditing = useCallback(() => {
    pendingActionRef.current = null;
    setDialogOpen(false);
  }, []);

  const discardAndProceed = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setDialogOpen(false);
    action?.();
  }, []);

  useEffect(() => {
    if (!guardPageExit || !isDirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.href === window.location.href ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search &&
          destination.hash !== window.location.hash)
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      requestAction(() => window.location.assign(destination.href));
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, [guardPageExit, isDirty, requestAction]);

  const unsavedDialog = (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) returnToEditing();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Есть несохранённые изменения</DialogTitle>
          <DialogDescription>
            Выйти без сохранения или вернуться к редактированию?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" onClick={returnToEditing}>
            Вернуться к редактированию
          </Button>
          <Button type="button" variant="destructive" onClick={discardAndProceed}>
            Выйти без сохранения
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { requestAction, unsavedDialog };
}
