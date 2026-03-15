import Link from "next/link";

type FeatureCardProps = {
  title: string;
  description?: string;
  href?: string;
  status?: "available" | "coming-soon" | "locked";
  /** Компактный вид: только заголовок, без описания и статуса (кнопка-блок). */
  compact?: boolean;
};

export function FeatureCard({ title, description, href, status = "available", compact }: FeatureCardProps) {
  const content = (
    <>
      {!compact && (
        <div className="feature-card__meta">
          <span className={`status-pill status-pill--${status}`}>{status.replace("-", " ")}</span>
        </div>
      )}
      <h2 className={compact ? "feature-card__title--compact" : undefined}>{title}</h2>
      {!compact && description ? <p>{description}</p> : null}
    </>
  );

  if (!href || status === "locked") {
    return (
      <article className={`feature-card ${compact ? "feature-card--compact" : ""}`}>{content}</article>
    );
  }

  return (
    <Link
      href={href}
      className={`feature-card feature-card--link ${compact ? "feature-card--compact" : ""}`}
    >
      {content}
    </Link>
  );
}
