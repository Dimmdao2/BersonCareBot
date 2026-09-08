import { SPECIALIST_PUBLIC_SITE_HREF } from '@/modules/help-content/specialistPublicSite';
import { cn } from '@/lib/utils';
import { patientBodyTextClass, patientInlineLinkClass } from '@/shared/ui/patient/patientVisual';

type Props = {
  className?: string;
  linkClassName?: string;
};

/** Текст + внешняя ссылка на полный сайт (как на экране «Запись»). */
export function PatientAboutSiteLink({ className, linkClassName }: Props) {
  return (
    <p className={cn(patientBodyTextClass, className)}>
      <span>Подробно обо мне и моих услугах — </span>
      <a
        href={SPECIALIST_PUBLIC_SITE_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          patientInlineLinkClass,
          linkClassName,
        )}
      >
        на моём сайте
      </a>
    </p>
  );
}
