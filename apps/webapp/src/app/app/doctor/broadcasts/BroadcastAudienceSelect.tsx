"use client";

import type { BroadcastAudienceFilter } from "@/modules/doctor-broadcasts/ports";
import { BROADCAST_AUDIENCE_FILTERS_ORDER, getAudienceOptionLabel } from "./labels";

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
      {BROADCAST_AUDIENCE_FILTERS_ORDER.map((v) => (
        <option key={v} value={v}>
          {getAudienceOptionLabel(v)}
        </option>
      ))}
    </select>
  );
}
