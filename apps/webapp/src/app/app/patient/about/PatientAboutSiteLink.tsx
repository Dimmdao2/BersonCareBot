import { SPECIALIST_PUBLIC_SITE_HREF } from "@/modules/help-content/specialistPublicSite";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  linkClassName?: string;
};

/** Текст + внешняя ссылка на полный сайт (как на экране «Запись»). */
export function PatientAboutSiteLink({ className, linkClassName }: Props) {
  return (
    <p className={cn("text-sm font-light leading-snug text-[#132a52]", className)}>
      <span>Подробно обо мне и моих услугах — </span>
      <a
        href={SPECIALIST_PUBLIC_SITE_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "font-light text-[var(--patient-color-primary)] underline decoration-[var(--patient-color-primary)] underline-offset-2",
          linkClassName,
        )}
      >
        на моём сайте
      </a>
    </p>
  );
}
