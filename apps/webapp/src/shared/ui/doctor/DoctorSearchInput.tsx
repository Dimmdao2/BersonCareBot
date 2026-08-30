'use client';

import type { ComponentProps } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';

type DoctorSearchInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
};

/** Единое поисковое поле doctor-zone: геометрия, типографика и системные иконки. */
export function DoctorSearchInput({
  value,
  onValueChange,
  onClear,
  className,
  ...props
}: DoctorSearchInputProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted-foreground">
        <Search className="size-3.5" aria-hidden />
      </span>
      <Input
        {...props}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn('h-8 pl-8 pr-8 text-sm', className)}
      />
      {value && onClear ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClear}
          className="absolute inset-y-0 right-0 my-auto size-8 text-muted-foreground hover:text-foreground"
          aria-label="Сбросить поиск"
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
