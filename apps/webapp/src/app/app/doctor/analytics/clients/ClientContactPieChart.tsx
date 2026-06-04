"use client";

import { useMemo } from "react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="mx-auto h-[200px] w-[200px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {slices.map((s) => (
                <Cell key={s.segment} fill={SEGMENT_COLORS[s.segment]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => [`${v} чел.`, ""]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                fontSize: 11,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {slices.map((s) => (
          <li key={s.segment} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ background: SEGMENT_COLORS[s.segment] }}
            />
            <span className="text-muted-foreground">{s.name}</span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
