"use client";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WIDGET_URL = "https://dmitryberson.rubitime.ru/widget";
const FALLBACK_URL = "https://dmitryberson.rubitime.ru/";

type Props = {
  className?: string;
};

/**
 * Виджет записи Rubitime. В iframe нельзя надёжно отловить сетевой сбой через `onError` —
 * всегда показываем ссылку «Открыть в новой вкладке» под виджетом.
 */
export function RubitimeWidget({ className }: Props) {
  return (
    <div className={cn("w-full max-w-lg overflow-hidden rounded-lg border", className)}>
      <iframe
        title="Rubitime — запись на приём"
        src={WIDGET_URL}
        className="h-[420px] w-full border-0 bg-background"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <p className="text-muted-foreground border-t px-2 py-1 text-center text-xs">
        <a
          href={FALLBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          Открыть страницу записи в новой вкладке
        </a>
      </p>
    </div>
  );
}
