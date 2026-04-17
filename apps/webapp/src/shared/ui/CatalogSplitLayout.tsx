"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CatalogSplitLayoutProps = {
  left: ReactNode;
  right: ReactNode;
  mobileView: "list" | "detail";
  mobileBackSlot?: ReactNode;
  className?: string;
};

export function CatalogSplitLayout({
  left,
  right,
  mobileView,
  mobileBackSlot,
  className,
}: CatalogSplitLayoutProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="hidden gap-4 lg:grid lg:grid-cols-2 lg:items-start">{left}{right}</div>

      <div className="relative min-h-[40vh] overflow-hidden lg:hidden">
        <div
          className={cn(
            "absolute inset-0 transition-transform duration-300 ease-out",
            mobileView === "list" ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {left}
        </div>

        <div
          className={cn(
            "absolute inset-0 z-10 overflow-y-auto bg-background px-1 pb-6 pt-2 transition-transform duration-300 ease-out",
            mobileView === "detail" ? "translate-x-0" : "translate-x-full",
          )}
        >
          {mobileBackSlot}
          {right}
        </div>
      </div>
    </div>
  );
}
