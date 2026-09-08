'use client';

import { isAppSupportPath } from '@/lib/url/isAppSupportPath';
import { isSafeExternalHref } from '@/lib/url/isSafeExternalHref';
import { SupportContactLink } from '@/shared/ui/patient/SupportContactLink';
import { patientBodyTextClass, patientInlineLinkClass } from '@/shared/ui/patient/patientVisual';

type Props = { href: string };

export function HelpSupportLink({ href }: Props) {
  const t = href.trim();
  if (!isAppSupportPath(t) && !isSafeExternalHref(t)) return null;
  return (
    <p className={patientBodyTextClass}>
      <SupportContactLink href={href} className={patientInlineLinkClass}>
        Написать в поддержку
      </SupportContactLink>
    </p>
  );
}
