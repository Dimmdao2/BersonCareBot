import Link from "next/link";

type Props = {
  id: string;
  title: string;
  value: number;
  tone?: "neutral" | "warning";
  hint?: string;
  href?: string;
};

export function DoctorStatCard({ id, title, value, tone = "neutral", hint, href }: Props) {
  return (
    <article
      id={id}
      className={
        tone === "warning"
          ? "rounded-xl border border-destructive/40 bg-destructive/5 p-4 shadow-sm"
          : "rounded-xl border border-border/60 bg-card p-4 shadow-sm"
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {href ? (
        <p className="mt-2 text-sm">
          <Link href={href} className="text-primary underline underline-offset-2">
            Открыть
          </Link>
        </p>
      ) : null}
    </article>
  );
}
