'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { MaterialRatingDoctorSummaryRow } from '@/modules/material-rating/types';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';

type MaterialRow = MaterialRatingDoctorSummaryRow & { label?: string | null };
type SummaryResponse = { ok?: boolean; rows?: MaterialRow[] };

const KIND_LABEL = {
  content_page: 'Страница',
  lfk_exercise: 'Упражнение',
  lfk_complex: 'Комплекс ЛФК',
} as const;

export function MaterialsAnalyticsTab() {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/doctor/material-ratings/summary?limit=100', {
        cache: 'no-store',
      });
      const json = (await response.json()) as SummaryResponse;
      if (!response.ok || !json.ok) throw new Error('material_ratings_failed');
      setRows(json.rows ?? []);
    } catch {
      setRows([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto py-3 max-w-6xl">
      <DoctorSection>
        <DoctorSectionTitle>Оценки материалов</DoctorSectionTitle>
        {loading ? <DoctorPanelLoading className="py-6" /> : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            Не удалось загрузить оценки материалов.
          </p>
        ) : null}
        {!loading && !error && rows.length === 0 ? (
          <DoctorEmptyState>Оценок пока нет</DoctorEmptyState>
        ) : null}
        {rows.length > 0 ? (
          <div className="divide-y divide-border/60 rounded-lg border border-border/60">
            {rows.map((row) => (
              <Link
                key={`${row.targetKind}-${row.targetId}`}
                href={`/app/doctor/material-ratings/${row.targetKind}/${row.targetId}`}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {row.label?.trim() || KIND_LABEL[row.targetKind]}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {KIND_LABEL[row.targetKind]} · {row.count} оценок
                  </span>
                </span>
                <span className="self-center text-base font-semibold tabular-nums text-primary">
                  {row.avg == null ? '—' : `${row.avg.toFixed(1)} ★`}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </DoctorSection>
    </div>
  );
}
