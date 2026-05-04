import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { patientCardClass, patientInlineLinkClass, patientMutedTextClass } from "@/shared/ui/patientVisual";

/**
 * Карточка раздела на главном экране: заголовок, описание, статус (доступно / скоро / заблокировано).
 * Может быть ссылкой или просто блоком. Компактный вариант — только заголовок, без описания.
 *
 * Ветки рендера (контракт стабилен для потребителей):
 * - нет `href` или `status === "locked"`: неинтерактивный блок (`role="article"`), `id` на корне.
 * - есть `secondaryHref`: корень с `id`, внутри Card и два соседних Link (без вложенных ссылок).
 * - иначе: один Link-обёртка на `href`, `id` на Link, внутри Card.
 *
 * Заголовок остаётся `h2` (не `CardTitle`), чтобы не менять outline документа на страницах со списком карточек.
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
  /** Вторичная ссылка (например «Открыть курс») без вложенности в основной href. */
  secondaryHref?: string;
  /** Подпись вторичной ссылки; по умолчанию «Открыть курс». */
  secondaryLabel?: string;
};

const STATUS_LABEL: Record<NonNullable<FeatureCardProps["status"]>, string> = {
  available: "доступно",
  "coming-soon": "скоро",
  locked: "заблокировано",
};

const STATUS_BADGE: Record<NonNullable<FeatureCardProps["status"]>, "default" | "secondary" | "outline" | "destructive"> =
  {
    available: "secondary",
    "coming-soon": "outline",
    locked: "destructive",
  };

/** Слой Card: patient surface + отключение дефолтного chrome shadcn Card (ring/py/gap), чтобы совпасть с прежним FeatureCard. */
function featureCardShellClass(compact: boolean | undefined, extra?: string) {
  return cn(
    patientCardClass,
    "transition-shadow",
    "!gap-0 !py-0 ring-0 text-[var(--patient-text-primary)] text-base",
    compact && "flex min-h-[52px] items-center justify-center text-center",
    extra,
  );
}

/** Рендерит карточку: при наличии ссылки и статусе не «заблокировано» — кликабельная, иначе просто блок. */
export function FeatureCard({
  title,
  description,
  href,
  status = "available",
  containerId,
  compact,
  secondaryHref,
  secondaryLabel = "Открыть курс",
}: FeatureCardProps) {
  const titleClass = cn(
    "font-semibold",
    compact ? "m-0 text-[0.95rem] font-medium" : "text-base",
  );

  const titleEl = <h2 className={titleClass}>{title}</h2>;

  const mainBlock = (
    <>
      {!compact && (
        <div className="mb-3">
          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
      )}
      {titleEl}
      {!compact && description ? <p className={cn(patientMutedTextClass, "mt-2")}>{description}</p> : null}
    </>
  );

  if (!href || status === "locked") {
    return (
      <Card
        id={containerId}
        role="article"
        className={featureCardShellClass(compact)}
      >
        {mainBlock}
      </Card>
    );
  }

  if (secondaryHref?.trim()) {
    return (
      <Card
        id={containerId}
        className={featureCardShellClass(
          compact,
          cn("flex flex-col gap-2", compact && "min-h-[52px] py-3"),
        )}
      >
        <Link
          href={href}
          className={cn(
            "block min-w-0 flex-1 hover:border-primary/30 hover:shadow-md active:scale-[0.98] md:hover:-translate-y-px",
            compact && "text-center",
          )}
        >
          {mainBlock}
        </Link>
        <Link
          href={secondaryHref}
          prefetch={false}
          className={cn(
            patientInlineLinkClass,
            "text-sm",
            compact ? "text-center text-xs" : "text-center sm:text-left",
          )}
        >
          {secondaryLabel}
        </Link>
      </Card>
    );
  }

  return (
    <Link
      href={href}
      id={containerId}
      className={cn(
        "block hover:border-primary/30 hover:shadow-md active:scale-[0.98] md:hover:-translate-y-px",
      )}
    >
      <Card className={featureCardShellClass(compact)}>{mainBlock}</Card>
    </Link>
  );
}
