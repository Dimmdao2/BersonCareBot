"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function subscribeMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getMobileViewportSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;
}

export type MediaPickerShellProps = {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

/**
 * Единая обёртка модалки выбора медиа: desktop — широкий Dialog, mobile — Sheet снизу.
 */
export function MediaPickerShell({ title, open, onOpenChange, children }: MediaPickerShellProps) {
  const isMobileViewport = useSyncExternalStore(subscribeMobileViewport, getMobileViewportSnapshot, () => false);

  if (isMobileViewport) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0">
          <SheetHeader className="shrink-0 border-b border-border/60">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pt-4 pb-3">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-auto px-4 pb-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
