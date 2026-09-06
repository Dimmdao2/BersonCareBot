'use client';

import { useCallback, useRef, useState } from 'react';
import type { DiagnosisCatalogSuggestion } from '@/modules/patient-clinical/ports';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

const fieldLabelClass = 'text-xs font-semibold text-foreground';
const hintClass = 'text-xs text-muted-foreground';

export type FormComplaintEntry = {
  id: string;
  priority: boolean;
  text: string;
  description: string;
  severity: number;
};

export type FormDiagnosisEntry = {
  id: string;
  priority: boolean;
  text: string;
  catalogId: string | null;
  comment: string;
};

export function PriorityFlag({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Button
      type="button"
      onClick={onToggle}
      title={on ? 'Приоритет: вкл' : 'Приоритет: выкл'}
      variant="ghost"
      size="icon-xs"
      className={cn(
        'flex-none text-base font-bold leading-none',
        on ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      !
    </Button>
  );
}

export function FormTextarea({
  label,
  placeholder,
  minH = 'min-h-[38px]',
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  minH?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabelClass}>{label}</span>
      <Textarea
        className={cn(minH)}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      />
    </div>
  );
}

export function DiagnosisAutocomplete({
  userId,
  onSelect,
}: {
  userId: string;
  onSelect: (entry: FormDiagnosisEntry) => void;
}) {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<DiagnosisCatalogSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(
    (query: string) => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      fetch(`/api/doctor/patients/${userId}/diagnosis-catalog?q=${encodeURIComponent(query)}`)
        .then(
          (response) =>
            response.json() as Promise<{ ok: boolean; suggestions: DiagnosisCatalogSuggestion[] }>,
        )
        .then((data) => {
          setSuggestions(data.suggestions ?? []);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    },
    [userId],
  );

  const handleChange = (value: string) => {
    setDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 280);
  };

  const selectEntry = (entry: DiagnosisCatalogSuggestion) => {
    onSelect({
      id: `fd${Date.now()}`,
      priority: false,
      text: entry.label,
      catalogId: entry.id,
      comment: '',
    });
    setDraft('');
    setSuggestions([]);
  };

  const createEntry = async () => {
    const label = draft.trim();
    if (!label) return;
    try {
      const response = await fetch(`/api/doctor/patients/${userId}/diagnosis-catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = (await response.json()) as { ok: boolean; entry: DiagnosisCatalogSuggestion };
      selectEntry(data.entry);
    } catch {
      // The existing patient-scoped catalog form leaves a rejected suggestion in place.
    }
  };

  const showDropdown = draft.trim().length > 0;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex-none text-base font-bold text-destructive">!</span>
        <Input
          type="search"
          value={draft}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Начните вводить — поиск по справочнику..."
          autoComplete="off"
          className="flex-1 rounded-t-lg"
        />
        <Button
          type="button"
          onClick={() => {
            setDraft('');
            setSuggestions([]);
          }}
          variant="ghost"
          size="icon-xs"
          className="flex-none text-sm text-muted-foreground"
        >
          ✕
        </Button>
      </div>
      {showDropdown ? (
        <div className="mx-[19px] overflow-hidden rounded-b-lg border border-t-0 border-primary bg-background text-sm">
          {loading ? <DoctorPanelLoading className="px-2.5 py-2" /> : null}
          {!loading
            ? suggestions.map((suggestion, index) => (
                <Button
                  type="button"
                  key={suggestion.id}
                  onClick={() => selectEntry(suggestion)}
                  variant="ghost"
                  className={cn(
                    'flex h-auto w-full items-center gap-1 rounded-none px-2.5 py-1.5 text-left hover:bg-primary/10',
                    index === 0 && 'bg-primary/10',
                    index > 0 && 'border-t border-border',
                  )}
                >
                  <span className="font-semibold text-foreground">{suggestion.label}</span>
                  {suggestion.note ? <span className={hintClass}>· {suggestion.note}</span> : null}
                </Button>
              ))
            : null}
          <Button
            type="button"
            onClick={() => void createEntry()}
            variant="ghost"
            className="flex h-auto w-full items-center rounded-none border-t border-border px-2.5 py-1.5 text-left font-medium text-primary hover:bg-primary/10"
          >
            + Создать в справочнике: «{draft}»
          </Button>
        </div>
      ) : null}
    </div>
  );
}
