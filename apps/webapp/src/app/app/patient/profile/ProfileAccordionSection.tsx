"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { patientCardClass } from "@/shared/ui/patientVisual";

type Props = {
  id?: string;
  title: string;
  /** Иконка статуса рядом с заголовком (выводится справа от текста, до шеврона). */
  statusIcon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

/**
 * Секция-аккордеон профиля: заголовок + опциональный статус-индикатор + шеврон.
 * Сохраняет стиль patient card, но контент скрыт до клика (Base UI `Collapsible`).
 */
export function ProfileAccordionSection({ id, title, statusIcon, children, defaultOpen = false }: Props) {
  return (
    <Collapsible id={id} defaultOpen={defaultOpen} className={cn(patientCardClass, "!p-0 overflow-hidden")}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex items-center gap-2 text-base font-semibold leading-snug">
          {title}
          {statusIcon}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--patient-text-muted)] transition-transform duration-200",
            "group-data-[panel-open]:rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 border-t border-[var(--patient-border)]/50 px-4 pb-4 pt-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
