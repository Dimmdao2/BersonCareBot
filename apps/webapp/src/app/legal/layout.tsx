import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/** Минимальная оболочка публичных правовых страниц: читаемый текст и возврат в приложение. */
export default function LegalLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 pb-12 pt-6">
        <header className="flex items-center justify-between gap-3">
          <Link href="/app" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 shrink-0")}>
            ← В приложение
          </Link>
        </header>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-foreground">{children}</div>
      </div>
    </div>
  );
}
