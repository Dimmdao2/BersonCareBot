import Link from "next/link";
import { SupportContactLink } from "@/shared/ui/SupportContactLink";
import { cn } from "@/lib/utils";

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
        "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground",
        className,
      )}
      aria-label="Правовая информация"
    >
      <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
        Условия использования
      </Link>
      <span className="text-border" aria-hidden>
        ·
      </span>
      <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
        Политика конфиденциальности
      </Link>
      {support ? (
        <>
          <span className="text-border" aria-hidden>
            ·
          </span>
          <SupportContactLink href={support} className="underline underline-offset-2 hover:text-foreground">
            Связь с поддержкой
          </SupportContactLink>
        </>
      ) : null}
    </nav>
  );
}
