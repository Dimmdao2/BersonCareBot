"use client";

export default function DoctorExercisesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top,0px)+0.5rem)] z-20 -mx-4 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur-md supports-backdrop-filter:bg-background/90 md:-mx-6 md:px-6">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="h-10 animate-pulse rounded-md bg-muted/50" />
              <div className="h-10 animate-pulse rounded-md bg-muted/50" />
              <div className="h-10 animate-pulse rounded-md bg-muted/50" />
            </div>
            <div className="h-9 w-32 animate-pulse self-end rounded-md bg-muted/50" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted/50" />
            <div className="flex gap-2">
              <div className="h-8 w-36 animate-pulse rounded-md bg-muted/50" />
              <div className="h-8 w-8 animate-pulse rounded-md bg-muted/50" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-border/60 p-2">
                <div className="h-32 animate-pulse rounded-md bg-muted/50" />
                <div className="mx-auto mt-3 h-4 w-4/5 animate-pulse rounded bg-muted/50" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="space-y-2">
                <div className="h-4 w-28 animate-pulse rounded bg-muted/50" />
                <div className="h-10 animate-pulse rounded-md bg-muted/50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
