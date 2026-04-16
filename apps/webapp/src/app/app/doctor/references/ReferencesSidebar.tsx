"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReferenceCategory } from "@/modules/references/types";

export function ReferencesSidebar({ categories }: { categories: ReferenceCategory[] }) {
  const pathname = usePathname();

  return (
    <aside className="rounded-xl border border-border bg-card p-3 lg:sticky lg:top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)] lg:max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-1.25rem)] lg:overflow-hidden">
      <p className="mb-3 text-sm text-muted-foreground">Список справочников</p>
      <ul className="flex flex-col gap-1 lg:max-h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px)-5.5rem)] lg:overflow-y-auto pr-1">
        {categories.map((cat) => {
          const href = `/app/doctor/references/${encodeURIComponent(cat.code)}`;
          const active = pathname === href;
          return (
            <li key={cat.id}>
              <Link
                href={href}
                className={cn(
                  "flex items-center justify-between rounded-md border border-transparent px-2 py-2 text-sm hover:bg-muted",
                  active &&
                    "border-primary/25 bg-primary/15 text-primary hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/25",
                )}
              >
                <span className="truncate">{cat.title}</span>
                <Badge variant={cat.isUserExtensible ? "secondary" : "outline"}>
                  {cat.isUserExtensible ? "Расш." : "Сист."}
                </Badge>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
