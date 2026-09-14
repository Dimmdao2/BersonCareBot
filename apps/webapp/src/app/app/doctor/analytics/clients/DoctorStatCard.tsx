import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  doctorInlineMetricValueClass,
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorInteractiveSurfaceButtonClass,
  doctorStatCardActionSegmentClass,
  doctorStatCardContentPaddingClass,
  doctorStatCardChevronClass,
  doctorStatCardInteractiveClass,
  doctorStatCardInteractiveNeutralClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
} from '@/shared/ui/doctor/doctorVisual';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/doctor/primitives/tooltip';
import { cn } from '@/lib/utils';

type Props = {
  id: string;
  title: ReactNode;
  value: ReactNode;
  secondaryValue?: ReactNode;
  tone?: 'neutral' | 'warning';
  hint?: string;
  tooltip?: string;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
  opensDetails?: boolean;
  className?: string;
  valueClassName?: string;
  hintClassName?: string;
  testId?: string;
  valuePlacement?: 'responsive' | 'inline' | 'side-center' | 'stacked';
  actionIcon?: ReactNode;
  actionLabel?: string;
  onActionClick?: () => void;
};

export function DoctorStatCard({
  id,
  title,
  value,
  secondaryValue,
  tone = 'neutral',
  hint,
  tooltip,
  selected,
  href,
  onClick,
  opensDetails,
  className,
  valueClassName,
  hintClassName,
  testId,
  valuePlacement = 'responsive',
  actionIcon,
  actionLabel,
  onActionClick,
}: Props) {
  const neutralNumericValueClass =
    tone === 'neutral' && typeof value === 'number'
      ? value === 0
        ? 'text-muted-foreground'
        : 'text-primary'
      : undefined;
  // Квадратная плитка (три КПИ в ряд на телефоне): подпись занимает всю ширину,
  // поэтому правый отступ под вынесенное вправо число здесь только отъедает место.
  // `flex items-center` — чтобы некликабельная плитка (article) держала содержимое
  // по центру так же, как кликабельная (кнопка центрирует его сама).
  const isStacked = valuePlacement === 'stacked';
  const shellClass = cn(
    tone === 'warning' ? doctorStatCardShellWarningClass : doctorStatCardShellClass,
    isStacked && 'flex items-center p-2.5',
    (href || onClick) && doctorStatCardInteractiveClass,
    tone === 'neutral' && (href || onClick) && doctorStatCardInteractiveNeutralClass,
    selected &&
      'border-primary/35 bg-primary/15 text-primary ring-1 ring-primary/25 hover:border-primary/40 hover:bg-primary/20',
    className,
  );
  const segmentedShellClass = cn(
    'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] overflow-hidden rounded-[var(--doctor-kpi-radius,8px)]',
    tone === 'warning' ? 'bg-destructive/5' : 'bg-card',
    selected && 'bg-primary/15 text-primary ring-1 ring-primary/25',
    className,
    'border-0',
  );
  const segmentedMainClass = cn(
    'min-w-0 rounded-l-[var(--doctor-kpi-radius,8px)] rounded-r-none border border-r-0 text-left',
    doctorStatCardContentPaddingClass,
    tone === 'warning'
      ? 'border-destructive/40 bg-destructive/5'
      : selected
        ? 'border-primary/35 bg-primary/15 text-primary'
        : onClick
          ? 'border-primary/35 bg-card hover:border-primary/40'
          : 'border-border/60 bg-card',
  );

  const label = (
    <p
      className={cn(
        doctorMetricLabelClass,
        isStacked && 'tracking-normal',
        selected && 'text-primary',
      )}
    >
      {title}
    </p>
  );
  const valueNode = (
    <div
      className={cn(
        doctorMetricValueClass,
        neutralNumericValueClass,
        selected && 'text-primary',
        valueClassName,
      )}
    >
      {value}
    </div>
  );
  const hintNode = hint ? (
    <p className={cn('mt-0.5 text-[10px] leading-snug text-muted-foreground', hintClassName)}>
      {hint}
    </p>
  ) : null;
  const metric = (
    <div className="flex items-baseline gap-0.5">
      {valueNode}
      {secondaryValue !== undefined ? (
        <div
          className={cn(
            'flex items-baseline gap-0.5 font-semibold tabular-nums text-foreground/75',
          )}
        >
          <span aria-hidden className="text-sm font-normal text-muted-foreground">
            /
          </span>
          <span className={doctorInlineMetricValueClass}>{secondaryValue}</span>
        </div>
      ) : null}
    </div>
  );
  // На квадратной плитке (три КПИ в ряд на телефоне) шеврон едет в одной строке с числом, а не в
  // отдельной колонке справа: подпись здесь обязана владеть всей шириной — см. комментарий выше.
  // Колонка под шеврон отнимала у неё 24 пикселя, и «Сообщения» теряли последнюю букву.
  const metricRow =
    opensDetails && isStacked ? (
      <div className="flex w-full min-w-0 items-center justify-between gap-2">
        {metric}
        <ChevronRight className={doctorStatCardChevronClass} aria-hidden />
      </div>
    ) : (
      metric
    );
  const inner = valuePlacement === 'side-center' ? (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-start gap-x-1.5">
      <div className="col-start-1 row-start-1">{label}</div>
      <div className="col-start-2 row-span-2 row-start-1 flex self-center justify-end">
        {metric}
      </div>
      {hint ? <div className="col-start-1 row-start-2">{hintNode}</div> : null}
    </div>
  ) : (
    <div
      className={cn(
        'w-full min-w-0',
        valuePlacement === 'responsive' &&
          'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5 md:block',
      )}
    >
      <div className={cn(valuePlacement === 'inline' ? 'flex items-baseline gap-2' : 'contents')}>
        {label}
        <div
          className={cn(
            valuePlacement === 'responsive' &&
              'col-start-2 flex items-baseline justify-end gap-0.5 md:mt-0.5 md:w-full md:justify-start md:gap-1',
          )}
        >
          {metricRow}
        </div>
      </div>
      {hint ? (
        <div className={cn(valuePlacement === 'responsive' && 'col-span-full')}>{hintNode}</div>
      ) : null}
    </div>
  );
  const content = opensDetails && !isStacked ? (
    <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <div className="min-w-0">{inner}</div>
      <ChevronRight className={doctorStatCardChevronClass} aria-hidden />
    </div>
  ) : (
    inner
  );

  if (actionIcon && actionLabel && onActionClick) {
    return (
      <article className={segmentedShellClass}>
        {onClick ? (
          <Button
            id={id}
            type="button"
            variant="ghost"
            className={cn(
              doctorInteractiveSurfaceButtonClass,
              segmentedMainClass,
              'w-full justify-start transition-colors focus-visible:ring-2 focus-visible:ring-primary/40',
            )}
            onClick={onClick}
            data-testid={testId}
          >
            {inner}
          </Button>
        ) : (
          <div id={id} className={segmentedMainClass} data-testid={testId}>
            {inner}
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          className={doctorStatCardActionSegmentClass}
          aria-label={actionLabel}
          onClick={onActionClick}
        >
          {actionIcon}
        </Button>
      </article>
    );
  }

  let trigger: ReactElement;

  if (href) {
    trigger = (
      <Link id={id} href={href} className={shellClass} data-testid={testId}>
        {content}
      </Link>
    );
  } else if (onClick) {
    trigger = (
      <Button
        id={id}
        type="button"
        variant="ghost"
        className={cn(
          doctorInteractiveSurfaceButtonClass,
          shellClass,
          'w-full justify-start text-left',
        )}
        onClick={onClick}
        aria-pressed={selected}
        data-testid={testId}
      >
        {content}
      </Button>
    );
  } else {
    trigger = (
      <article
        id={id}
        className={shellClass}
        tabIndex={tooltip ? 0 : undefined}
        data-testid={testId}
      >
        {content}
      </article>
    );
  }

  if (!tooltip) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
