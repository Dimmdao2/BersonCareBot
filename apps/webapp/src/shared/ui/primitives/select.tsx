'use client';

/**
 * Выпадающий список на `@base-ui/react/select`.
 *
 * # Подпись выбранного значения в триггере — решено ОДИН РАЗ здесь
 *
 * Base UI (в отличие от Radix) НЕ читает подпись из смонтированного `<Select.Item>`.
 * `Select.Value` резолвит подпись ТОЛЬКО через проп `items` на `Select.Root`
 * (`internals/resolveValueLabel.ts::resolveSelectedLabel`), а при промахе падает в
 * `stringifyAsLabel(value)` — то есть печатает СЫРОЙ КЛЮЧ/uuid. Постоянно, а не «до первого
 * открытия»: пока значение не выбрано виден placeholder, после выбора — ключ.
 * Именно поэтому баг «в списке подписи, в поле ключ» возвращался годами: чинили его
 * ОПТ-ИН (`displayLabel` на каждом вызове), и каждый новый экран заводил его заново.
 *
 * Поэтому здешний `Select` — обёртка, которая САМА собирает `items` из своих
 * `<SelectItem value=…>подпись</SelectItem>` (см. `collectItemLabels`). Ничего писать на
 * вызове не надо: `<SelectValue />` показывает подпись по умолчанию.
 *
 * Явные опции (все опциональны, побеждают авто-сбор):
 * - `items` на `<Select>` — если опции рендерит ОТДЕЛЬНЫЙ компонент, а не литеральные дети
 *   (авто-сбор проходит по дереву `children`, `.map()` и `? :` он видит, чужой компонент — нет);
 * - явные дети `<SelectValue>…</SelectValue>` — когда подпись в поле ≠ подписи в списке;
 * - `displayLabel` на `<SelectTrigger>` — легаси-форма того же самого.
 *
 * ⚠️ `label` на `<SelectItem>` подпись в триггере НЕ чинит — в Base UI это только
 * keyboard-typeahead (`SelectItem.d.ts`: «text label to use when the item is matched during
 * keyboard text navigation»).
 *
 * Гейт, который держит это на месте: `selectValueLabelCensus.test.ts`.
 */

import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';

import { cn } from '@/lib/utils';
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from 'lucide-react';

type DerivedItem = { value: unknown; label: React.ReactNode };

/**
 * Обходит дерево `children` и собирает `{ value, label }` каждого `<SelectItem>`.
 * `React.Children` разворачивает массивы (`.map()`) и фрагменты, поэтому динамические
 * списки собираются так же, как литеральные.
 */
function collectItemLabels(children: React.ReactNode, out: DerivedItem[] = []): DerivedItem[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props = child.props as {
      value?: unknown;
      children?: React.ReactNode;
    };
    if (child.type === SelectItem && props.value !== undefined) {
      out.push({ value: props.value, label: props.children });
    }
    if (props.children !== undefined) collectItemLabels(props.children, out);
  });
  return out;
}

function Select<Value, Multiple extends boolean | undefined = false>({
  items,
  children,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const derivedItems = React.useMemo(() => {
    if (items !== undefined) return items;
    const collected = collectItemLabels(children);
    // Пустой массив ведёт себя как `undefined`, но `undefined` не меняет ни одной ветки
    // в `SelectValue`/`hasNullItemLabel` — оставляем поведение Base UI байт-в-байт.
    return collected.length > 0
      ? (collected as SelectPrimitive.Root.Props<Value, Multiple>['items'])
      : undefined;
  }, [items, children]);

  return (
    <SelectPrimitive.Root
      {...(props as SelectPrimitive.Root.Props<Value, Multiple>)}
      items={derivedItems}
    >
      {children}
    </SelectPrimitive.Root>
  );
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('scroll-my-1 p-1', className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('flex flex-1 text-left', className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  displayLabel,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: 'sm' | 'default';
  /**
   * Человекочитаемая подпись выбранного значения.
   * Когда задана — автоматически оборачивается в `<SelectValue>`,
   * что устраняет отображение сырого ключа/uuid до первого открытия списка.
   * Если не задана — рендерится `children` как прежде (обратная совместимость).
   *
   * @example
   * <SelectTrigger displayLabel={options.find(o => o.value === val)?.label}>
   */
  displayLabel?: React.ReactNode;
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "box-border flex h-[32px] w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 py-1 text-sm leading-5 text-foreground whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {displayLabel !== undefined ? <SelectValue>{displayLabel}</SelectValue> : children}
      <SelectPrimitive.Icon
        render={<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />}
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            'relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-1.5 py-1 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
