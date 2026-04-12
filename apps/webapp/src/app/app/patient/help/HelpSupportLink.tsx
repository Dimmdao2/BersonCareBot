"use client";

import { isAppSupportPath } from "@/lib/url/isAppSupportPath";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";

type Props = { href: string };

export function HelpSupportLink({ href }: Props) {
  const t = href.trim();
  if (!isAppSupportPath(t) && !isSafeExternalHref(t)) return null;
  return (
    <p className="text-sm">
      <SupportContactLink href={href} className="text-primary underline">
        Написать в поддержку
      </SupportContactLink>
    </p>
  );
}
