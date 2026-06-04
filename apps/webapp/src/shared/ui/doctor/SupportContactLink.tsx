"use client";

import { isAppSupportPath } from "@/lib/url/isAppSupportPath";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { cn } from "@/lib/utils";

type SupportContactLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

/**
 * Внутренний путь `/app/...` → нативный `<a>` (полная загрузка документа), чтобы после деплоя не ловить
 * «Failed to load chunk»: клиентский `Link` оставляет старый бандл и тянет уже удалённые чанки.
 * Внешний URL — `<a target="_blank">`.
 */
export function SupportContactLink({ href, className, children }: SupportContactLinkProps) {
  const h = href.trim();
  if (!h) return null;
  if (isAppSupportPath(h)) {
    return (
      <a href={h} className={cn(className)}>
        {children}
      </a>
    );
  }
  if (!isSafeExternalHref(h)) return null;
  return (
    <a href={h} target="_blank" rel="noopener noreferrer" className={cn(className)}>
      {children}
    </a>
  );
}
