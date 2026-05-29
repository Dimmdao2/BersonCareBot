import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  step: number;
  totalSteps: number;
  backHref: string | null;
  children: ReactNode;
};

export function PublicBookingShell({ title, step, totalSteps, backHref, children }: Props) {
  const showBack = Boolean(backHref && step > 1);
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className={cn("flex items-center text-xs text-muted-foreground", showBack ? "justify-between" : "justify-center")}>
          {showBack && backHref ? (
            <Link href={backHref} prefetch={false} className="font-medium text-primary underline-offset-2 hover:underline">
              Назад
            </Link>
          ) : null}
          <span>
            Шаг {step} из {totalSteps}
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
