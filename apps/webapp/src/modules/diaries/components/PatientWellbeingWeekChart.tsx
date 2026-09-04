'use client';

import dynamic from 'next/dynamic';
import type { PatientWellbeingWeekComposedChartProps } from './PatientWellbeingWeekComposedChart';
import { AppContentLoading } from '@/shared/ui/AppContentLoading';

const Inner = dynamic(() => import('./PatientWellbeingWeekComposedChart'), {
  ssr: false,
  loading: () => <AppContentLoading className="min-h-[220px]" />,
});

export type PatientWellbeingWeekChartProps = PatientWellbeingWeekComposedChartProps;

/** График вытесняет горизонтальный padding секции. */
export function PatientWellbeingWeekChart(chartProps: PatientWellbeingWeekChartProps) {
  return (
    <div className="-mx-4 min-w-0 overflow-x-visible">
      <Inner {...chartProps} />
    </div>
  );
}
