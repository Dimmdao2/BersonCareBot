import Link from "next/link";

/**
 * Карточка раздела на главном экране: заголовок, описание, статус (доступно / скоро / заблокировано).
 * Может быть ссылкой или просто блоком. Компактный вариант — только заголовок, без описания.
 * Используется на главной пациента для кабинета («Дневник», «Мои записи»), уроков и т.д.
 */

type FeatureCardProps = {
  title: string;
  description?: string;
  href?: string;
  status?: "available" | "coming-soon" | "locked";
  /** Стабильный id контейнера карточки. */
  containerId?: string;
  /** Компактный вид: только заголовок, без описания и статуса. */
  compact?: boolean;
};

/** Рендерит карточку: при наличии ссылки и статусе не «заблокировано» — кликабельная, иначе просто блок. */
export function FeatureCard({
  title,
  description,
  href,
  status = "available",
  containerId,
  compact,
}: FeatureCardProps) {
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
      <article id={containerId} className={`feature-card ${compact ? "feature-card--compact" : ""}`}>
        {content}
      </article>
    );
  }

  return (
    <Link
      href={href}
      id={containerId}
      className={`feature-card feature-card--link transition-transform active:scale-[0.98] ${compact ? "feature-card--compact" : ""}`}
    >
      {content}
    </Link>
  );
}
