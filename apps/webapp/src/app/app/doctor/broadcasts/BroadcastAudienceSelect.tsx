"use client";

import type { BroadcastAudienceFilter } from "@/modules/doctor-broadcasts/ports";
import { AUDIENCE_LABELS } from "./labels";

const AUDIENCE_OPTIONS = Object.entries(AUDIENCE_LABELS) as [BroadcastAudienceFilter, string][];

type Props = {
  value: BroadcastAudienceFilter | "";
  onChange: (v: BroadcastAudienceFilter) => void;
  disabled?: boolean;
  id?: string;
};

export function BroadcastAudienceSelect({ value, onChange, disabled, id }: Props) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value as BroadcastAudienceFilter;
        if (v) onChange(v);
      }}
      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="" disabled>
        — выберите аудиторию —
      </option>
      {AUDIENCE_OPTIONS.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
