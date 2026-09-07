'use client';

import { useMemo } from 'react';
import type { BroadcastAudienceFilter } from '@/modules/doctor-broadcasts/ports';
import { ReferenceSelect } from '@/shared/ui/doctor/ReferenceSelect';
import { BROADCAST_AUDIENCE_FILTERS_ORDER, getAudienceOptionLabel } from './labels';
import type { ReferenceItemDto } from '@/modules/references/referenceCache';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';

type Props = {
  value: BroadcastAudienceFilter | '';
  onChange: (v: BroadcastAudienceFilter) => void;
  disabled?: boolean;
  id?: string;
};

export function BroadcastAudienceSelect({ value, onChange, disabled, id }: Props) {
  const { patientPluralLabel } = useDoctorPatientTerms();
  const audienceItems = useMemo<ReferenceItemDto[]>(
    () =>
      BROADCAST_AUDIENCE_FILTERS_ORDER.map((filter, idx) => ({
        id: filter,
        code: filter,
        title: getAudienceOptionLabel(filter, patientPluralLabel),
        sortOrder: idx,
      })),
    [patientPluralLabel],
  );
  return (
    <ReferenceSelect
      id={id}
      prefetchedItems={audienceItems}
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
