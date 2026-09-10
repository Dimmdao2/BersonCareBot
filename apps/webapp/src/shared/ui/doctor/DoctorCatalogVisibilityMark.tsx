'use client';

import { Archive, Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

export function DoctorCatalogVisibilityMark({
  status,
  className,
}: {
  status: 'published' | 'draft' | 'archived';
  className?: string;
}) {
  if (status === 'archived') {
    return (
      <Archive className={cn('size-4 text-muted-foreground', className)} aria-label="В архиве" />
    );
  }

  if (status === 'published') {
    return <Eye className={cn('size-4 text-emerald-600', className)} aria-label="Опубликован" />;
  }

  return <EyeOff className={cn('size-4 text-muted-foreground', className)} aria-label="Черновик" />;
}
