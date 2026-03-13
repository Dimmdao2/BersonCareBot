import Link from "next/link";
import type { ReactNode } from "react";
import type { SessionUser } from "@/shared/types/session";

type AppShellProps = {
  title: string;
  user: SessionUser | null;
  children: ReactNode;
};

export function AppShell({ title, user, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <div className="eyebrow">BersonCare Platform</div>
          <h1>{title}</h1>
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
