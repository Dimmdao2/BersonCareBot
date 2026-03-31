import Link from "next/link";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  baseQuery: URLSearchParams;
};

export function DoctorMessagesLogPager({ page, pageSize, total, baseQuery }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;

  const hrefFor = (targetPage: number) => {
    const q = new URLSearchParams(baseQuery.toString());
    q.set("page", String(targetPage));
    q.set("pageSize", String(pageSize));
    return `/app/doctor/messages?${q.toString()}`;
  };

  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      <span className="text-xs text-muted-foreground">
        Страница {page} из {totalPages} · всего {total}
      </span>
      <div className="flex gap-2">
        {prevPage ? (
          <Link href={hrefFor(prevPage)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Назад
          </Link>
        ) : null}
        {nextPage ? (
          <Link href={hrefFor(nextPage)} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Вперёд
          </Link>
        ) : null}
      </div>
    </div>
  );
}
