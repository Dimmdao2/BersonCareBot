"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CatalogSplitLayoutProps = {
  left: ReactNode;
  right: ReactNode;
  mobileView: "list" | "detail";
  mobileBackSlot?: ReactNode;
  className?: string;
  /**
   * Tailwind class that sets the desktop grid-cols.
   * Defaults to "lg:grid-cols-2" — the historical equal-split behaviour.
   * Pass e.g. "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" for an asymmetric split.
   * ADDITIVE — existing callers that omit this prop are visually unchanged.
   */
  desktopColsClassName?: string;
};

export function CatalogSplitLayout({
  left,
  right,
  mobileView,
  mobileBackSlot,
  className,
  desktopColsClassName = "lg:grid-cols-2",
}: CatalogSplitLayoutProps) {
  return (
    <div
      className={cn(
        "relative min-h-[calc(100dvh_-_8rem)] overflow-hidden lg:grid lg:min-h-0 lg:items-stretch lg:gap-3 lg:overflow-x-hidden lg:overflow-y-visible",
        desktopColsClassName,
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 overflow-y-auto transition-transform duration-300 ease-out lg:static lg:flex lg:min-h-0 lg:min-w-0 lg:flex-col lg:overflow-visible lg:translate-x-0",
          mobileView === "list" ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {left}
      </div>

      <div
        className={cn(
          "absolute inset-0 z-10 overflow-y-auto bg-background px-1 pb-6 pt-2 transition-transform duration-300 ease-out lg:static lg:z-auto lg:flex lg:min-h-0 lg:min-w-0 lg:flex-col lg:overflow-visible lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:translate-x-0",
          mobileView === "detail" ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="lg:hidden">{mobileBackSlot}</div>
        {right}
      </div>
    </div>
  );
}
