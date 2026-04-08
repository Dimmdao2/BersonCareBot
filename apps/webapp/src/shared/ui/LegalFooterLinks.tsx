import Link from "next/link";
import { cn } from "@/lib/utils";

type LegalFooterLinksProps = {
  className?: string;
};

/** Компактные ссылки на публичные правовые страницы (OAuth consent screen, подвал экранов). */
export function LegalFooterLinks({ className }: LegalFooterLinksProps) {
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
    </nav>
  );
}
