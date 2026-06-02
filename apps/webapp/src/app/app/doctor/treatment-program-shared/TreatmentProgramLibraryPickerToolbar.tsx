"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXERCISE_LOAD_TYPE_CATEGORY_CODE } from "@/modules/lfk-exercises/exerciseLoadTypeReference";
import { DOCTOR_CATALOG_FILTER_MISSING } from "@/shared/lib/doctorCatalogEmptyFieldFilter";
import { ReferenceSelect } from "@/shared/ui/ReferenceSelect";

type Props = {
  idPrefix: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  regionCode: string | null;
  onRegionCodeChange: (code: string | null) => void;
  loadType: string | null;
  onLoadTypeChange: (code: string | null) => void;
  showRegionLoadFilters: boolean;
  disabled?: boolean;
};

export function TreatmentProgramLibraryPickerToolbar(props: Props) {
  const {
    idPrefix,
    searchQuery,
    onSearchQueryChange,
    regionCode,
    onRegionCodeChange,
    loadType,
    onLoadTypeChange,
    showRegionLoadFilters,
    disabled,
  } = props;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <Label htmlFor={`${idPrefix}-search`}>Поиск</Label>
          <Input
            id={`${idPrefix}-search`}
            className="text-sm"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Поиск по названию"
            disabled={disabled}
          />
        </div>
        {showRegionLoadFilters ? (
          <>
            <div className="w-40 shrink-0">
              <label className="sr-only" htmlFor={`${idPrefix}-region`}>
                Регион
              </label>
              <ReferenceSelect
                id={`${idPrefix}-region`}
                categoryCode="body_region"
                valueMatch="code"
                submitField="code"
                value={regionCode}
                onChange={onRegionCodeChange}
                placeholder="Все регионы"
                clearOptionLabel="Все регионы"
                missingValueOption={{
                  value: DOCTOR_CATALOG_FILTER_MISSING,
                  label: "Без региона",
                }}
                showAllOnFocus
                searchable={false}
              />
            </div>
            <div className="w-40 shrink-0">
              <label className="sr-only" htmlFor={`${idPrefix}-load`}>
                Тип нагрузки
              </label>
              <ReferenceSelect
                id={`${idPrefix}-load`}
                categoryCode={EXERCISE_LOAD_TYPE_CATEGORY_CODE}
                valueMatch="code"
                submitField="code"
                value={loadType}
                onChange={onLoadTypeChange}
                placeholder="Все типы"
                clearOptionLabel="Все типы"
                missingValueOption={{
                  value: DOCTOR_CATALOG_FILTER_MISSING,
                  label: "Без типа",
                }}
                showAllOnFocus
                searchable={false}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
