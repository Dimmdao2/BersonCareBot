'use client';

import { DoctorCatalogStickyToolbar } from '@/shared/ui/doctor/DoctorCatalogStickyToolbar';

export default function DoctorLfkTemplatesLoading() {
  return (
    <div className="flex flex-col gap-3">
      <DoctorCatalogStickyToolbar>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="h-10 animate-pulse rounded-md bg-muted/50" />
            <div className="h-10 animate-pulse rounded-md bg-muted/50" />
            <div className="h-10 animate-pulse rounded-md bg-muted/50" />
          </div>
          <div className="h-9 w-28 animate-pulse self-center rounded-md bg-muted/50" />
        </div>
      </DoctorCatalogStickyToolbar>

      <div className="hidden gap-3 lg:grid lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 h-8 animate-pulse rounded-md bg-muted/50" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded-md bg-muted/40" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-10 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 lg:hidden">
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-12 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
