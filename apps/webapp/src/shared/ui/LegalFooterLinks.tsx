import Link from "next/link";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";
import { cn } from "@/lib/utils";
import { patientInlineLinkClass } from "@/shared/ui/patientVisual";

type LegalFooterLinksProps = {
  className?: string;
  /** Внутренний путь `/app/…` или безопасный внешний URL — см. `SupportContactLink`. */
  supportHref?: string;
};

/** Компактные ссылки на публичные правовые страницы (OAuth consent screen, подвал экранов). */
export function LegalFooterLinks({ className, supportHref }: LegalFooterLinksProps) {
  const support = supportHref?.trim() ?? "";
  return (
    <nav
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-[var(--patient-text-muted)]",
        className,
      )}
      aria-label="Правовая информация"
    >
      <Link href="/legal/terms" className={cn(patientInlineLinkClass, "font-normal underline underline-offset-2")}>
        Условия использования
      </Link>
      <span className="text-[var(--patient-border)]" aria-hidden>
        ·
      </span>
      <Link href="/legal/privacy" className={cn(patientInlineLinkClass, "font-normal underline underline-offset-2")}>
        Политика конфиденциальности
      </Link>
      {support ? (
        <>
          <span className="text-[var(--patient-border)]" aria-hidden>
            ·
          </span>
          <SupportContactLink
            href={support}
            className={cn(patientInlineLinkClass, "font-normal underline underline-offset-2")}
          >
            Связь с поддержкой
          </SupportContactLink>
        </>
      ) : null}
    </nav>
  );
}
