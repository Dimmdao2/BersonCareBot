import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/shared/types/session";

type AppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
  /** Ссылка «Меню» на главный экран (для страниц разделов). */
  backHref?: string;
  backLabel?: string;
  /** Чуть меньший заголовок (главный экран). */
  titleSmall?: boolean;
};

export function AppShell({ title, user, children, backHref, backLabel = "Меню", titleSmall }: AppShellProps) {
  return (
    <div className={`app-shell ${titleSmall ? "app-shell--title-small" : ""}`}>
      <header className="top-bar">
        <div>
          <div className="top-bar__title-row">
            {backHref ? (
              <Link href={backHref} className="button button--back">
                {backLabel}
              </Link>
            ) : null}
            <div>
              <div className="eyebrow">BersonCare Platform</div>
              <h1 className={backHref ? "top-bar__h1--with-back" : undefined}>{title}</h1>
            </div>
          </div>
        </div>
        <div className="top-bar__actions">
          {user ? (
            <div className="user-pill">
              <span>{user.displayName}</span>
              <span className="user-pill__role">{user.role}</span>
            </div>
          ) : null}
          <Link href="/app/settings" className="button button--ghost">
            Настройки
          </Link>
        </div>
      </header>
      <main className="content-area">{children}</main>
    </div>
  );
}
