import type { ReactNode } from "react";

type PlaceholderPageProps = {
  title: string;
  children?: ReactNode;
};

/** Заглушка раздела «в разработке». */
export function PlaceholderPage({ title, children }: PlaceholderPageProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
      <p className="text-muted-foreground">Раздел в разработке</p>
      <p className="mt-2 text-base font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}
