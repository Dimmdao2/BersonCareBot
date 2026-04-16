"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReferenceCategory } from "@/modules/references/types";

export function ReferencesSidebar({ categories }: { categories: ReferenceCategory[] }) {
  const pathname = usePathname();

  return (
    <aside className="rounded-xl border border-border bg-card p-3">
      <p className="mb-3 text-sm text-muted-foreground">Список справочников</p>
      <ul className="flex flex-col gap-1">
        {categories.map((cat) => {
          const href = `/app/doctor/references/${encodeURIComponent(cat.code)}`;
          const active = pathname === href;
          return (
            <li key={cat.id}>
              <Link
                href={href}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted",
                  active && "bg-primary text-primary-foreground hover:bg-primary/90"
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
