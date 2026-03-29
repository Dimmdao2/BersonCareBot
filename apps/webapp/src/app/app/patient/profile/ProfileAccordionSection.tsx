"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  title: string;
  /** Иконка статуса рядом с заголовком (выводится справа от текста, до шеврона). */
  statusIcon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

/**
 * Секция-аккордеон профиля: заголовок + опциональный статус-индикатор + шеврон.
 * Сохраняет стиль card (border, bg-card, shadow-sm), но контент скрыт до клика.
 */
export function ProfileAccordionSection({ id, title, statusIcon, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div id={id} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-base font-semibold leading-snug">
          {title}
          {statusIcon}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-4 border-t border-border/50 px-4 pb-4 pt-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
