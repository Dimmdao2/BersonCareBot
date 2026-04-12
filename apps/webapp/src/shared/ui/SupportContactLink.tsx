"use client";

import Link from "next/link";
import { isAppSupportPath } from "@/lib/url/isAppSupportPath";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { cn } from "@/lib/utils";

type SupportContactLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
};

/** Внутренний путь `/app/...` → `Link`; иначе безопасный внешний URL → `<a target="_blank">`. */
export function SupportContactLink({ href, className, children }: SupportContactLinkProps) {
  const h = href.trim();
  if (!h) return null;
  if (isAppSupportPath(h)) {
    return (
      <Link href={h} className={cn(className)}>
        {children}
      </Link>
    );
  }
  if (!isSafeExternalHref(h)) return null;
  return (
    <a href={h} target="_blank" rel="noopener noreferrer" className={cn(className)}>
      {children}
    </a>
  );
}
