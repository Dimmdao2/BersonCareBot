import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PhoneMockupProps = {
  children: ReactNode;
  className?: string;
};

/** Оболочка «телефон» для скринов и иконки PWA. */
export function PhoneMockup({ children, className }: PhoneMockupProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-[#DDE3F0] bg-[#0f1f3d] p-2 shadow-[0_24px_80px_rgba(31,61,120,0.18)] sm:rounded-[32px] sm:p-2.5",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[22px] bg-white sm:rounded-[26px]">{children}</div>
    </div>
  );
}
