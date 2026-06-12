"use client";

import type { BroadcastAudienceFilter } from "@/modules/doctor-broadcasts/ports";
import { ReferenceSelect } from "@/shared/ui/doctor/ReferenceSelect";
import { BROADCAST_AUDIENCE_FILTERS_ORDER, getAudienceOptionLabel } from "./labels";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";

type Props = {
  value: BroadcastAudienceFilter | "";
  onChange: (v: BroadcastAudienceFilter) => void;
  disabled?: boolean;
  id?: string;
};

/** Список сегментов аудитории как псевдо-справочник для ReferenceSelect. */
const AUDIENCE_ITEMS: ReferenceItemDto[] = BROADCAST_AUDIENCE_FILTERS_ORDER.map(
  (filter, idx) => ({
    id: filter,
    code: filter,
    title: getAudienceOptionLabel(filter),
    sortOrder: idx,
  }),
);

export function BroadcastAudienceSelect({ value, onChange, disabled, id }: Props) {
  return (
    <ReferenceSelect
      id={id}
      prefetchedItems={AUDIENCE_ITEMS}
      valueMatch="id"
      value={value || null}
      onChange={(nextValue) => {
        if (nextValue) onChange(nextValue as BroadcastAudienceFilter);
      }}
      placeholder="— выберите аудиторию —"
      disabled={disabled}
      searchable={false}
      showAllOnFocus
      clearOptionLabel={undefined}
    />
  );
}
