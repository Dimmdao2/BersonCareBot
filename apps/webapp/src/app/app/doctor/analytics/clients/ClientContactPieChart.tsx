"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { ClientContactBreakdown, ClientContactPieSegment } from "@/modules/doctor-clients/clientContactSegments";
import { CLIENT_CONTACT_PIE_SEGMENT_LABELS } from "@/modules/doctor-clients/clientContactSegments";

const SEGMENT_COLORS: Record<ClientContactPieSegment, string> = {
  telegram_only: "hsl(200 70% 48%)",
  max_only: "hsl(280 55% 52%)",
  email_only: "hsl(38 75% 52%)",
  telegram_email: "hsl(200 60% 38%)",
  max_email: "hsl(280 50% 42%)",
  phone_email_no_messenger: "hsl(142 45% 42%)",
};

const PIE_ORDER: ClientContactPieSegment[] = [
  "telegram_only",
  "max_only",
  "email_only",
  "telegram_email",
  "max_email",
  "phone_email_no_messenger",
];

const CHART_SIZE = 176;
const PIE_MARGIN = { top: 12, right: 12, bottom: 12, left: 12 };

type SliceRow = {
  segment: ClientContactPieSegment;
  name: string;
  value: number;
};

function ContactPieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: SliceRow }>;
}) {
  if (!active || !payload?.[0]?.payload) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-white px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-foreground">{row.name}</p>
      <p className="tabular-nums text-muted-foreground">{row.value} чел.</p>
    </div>
  );
}

export function ClientContactPieChart({ breakdown }: { breakdown: ClientContactBreakdown }) {
  const slices = useMemo(
    () =>
      PIE_ORDER.map((segment) => ({
        segment,
        name: CLIENT_CONTACT_PIE_SEGMENT_LABELS[segment],
        value: breakdown.pie[segment],
      })).filter((s) => s.value > 0),
    [breakdown.pie],
  );

  if (slices.length === 0) {
    return <p className="text-sm text-muted-foreground">Нет клиентов в сегментах диаграммы.</p>;
  }

  const innerRadius = Math.round(CHART_SIZE * 0.28);
  const outerRadius = Math.round(CHART_SIZE * 0.4);

  return (
    <div className="flex w-full flex-col items-stretch gap-3">
      <div
        className="relative mx-auto w-full max-w-[200px] overflow-visible"
        style={{ height: CHART_SIZE }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={PIE_MARGIN}>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
            >
              {slices.map((s) => (
                <Cell key={s.segment} fill={SEGMENT_COLORS[s.segment]} />
              ))}
            </Pie>
            <Tooltip content={<ContactPieTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.segment} className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: SEGMENT_COLORS[s.segment] }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 text-muted-foreground">{s.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
