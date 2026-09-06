'use client';

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { Recommendation } from '@/modules/recommendations/types';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import {
  VISIT_MANIPULATION_REFERENCE_CATEGORY_CODE,
  appendVisitCatalogText,
  formatRecommendationForVisit,
  visitCatalogOptionToText,
  type VisitCatalogOption,
} from './visitCatalogText';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';

const fieldLabelClass = 'text-xs font-semibold text-foreground';
const hintClass = 'text-xs text-muted-foreground';
const VISIBLE_OPTIONS_LIMIT = 40;

type ReferenceItemDto = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
};

async function loadDoctorReferenceItems(categoryCode: string): Promise<ReferenceItemDto[]> {
  const res = await fetch(`/api/doctor/references/${encodeURIComponent(categoryCode)}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { ok?: boolean; items?: ReferenceItemDto[] };
  return data.ok && Array.isArray(data.items) ? data.items : [];
}

export function VisitCatalogTextarea({
  label,
  placeholder,
  value,
  onChange,
  catalog,
  rows,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  catalog: 'manipulations' | 'recommendations';
  rows?: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<VisitCatalogOption[]>([]);
  const [query, setQuery] = useState('');
  const textareaId = useId();
  const listId = useId();
  const searchId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      if (catalog === 'manipulations') {
        const items = await loadDoctorReferenceItems(VISIT_MANIPULATION_REFERENCE_CATEGORY_CODE);
        setOptions(items.map((item) => ({ id: item.id, title: item.title })));
        return;
      }
      const res = await fetch('/api/doctor/recommendations', {
        credentials: 'include',
      });
      if (!res.ok) {
        setOptions([]);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; items?: Recommendation[] };
      setOptions((data.items ?? []).map(formatRecommendationForVisit));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [catalog]);

  const toggleOpen = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && options.length === 0) void loadOptions();
      if (!next) setQuery('');
      return next;
    });
  };

  const insertOption = (option: VisitCatalogOption) => {
    onChange(appendVisitCatalogText(value, visitCatalogOptionToText(option)));
    setOpen(false);
    setQuery('');
  };

  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const searchable = [option.title, option.meta ?? '', option.body ?? '']
        .join(' ')
        .toLocaleLowerCase('ru-RU');
      return searchable.includes(normalizedQuery);
    });
  }, [normalizedQuery, options]);
  const visibleOptions = filteredOptions.slice(0, VISIBLE_OPTIONS_LIMIT);
  const hiddenOptionsCount = filteredOptions.length - visibleOptions.length;

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      return;
    }
    if (event.key === 'ArrowDown' && visibleOptions.length > 0) {
      event.preventDefault();
      optionRefs.current[0]?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label htmlFor={textareaId} className={fieldLabelClass}>
          {label}
        </label>
        <Button
          type="button"
          onClick={toggleOpen}
          title="Выбрать из справочника"
          aria-label={`Выбрать из справочника: ${label}`}
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          variant="ghost"
          size="icon-xs"
          className="border border-primary/40 text-sm text-primary"
        >
          +
        </Button>
      </div>
      {open ? (
        <div
          id={listId}
          role="group"
          className="overflow-hidden rounded-lg border border-border bg-background"
        >
          {loading ? (
            <DoctorPanelLoading className="px-2.5 py-2" />
          ) : options.length > 0 ? (
            <>
              <div className="border-b border-border p-2">
                <label htmlFor={searchId} className="sr-only">
                  Поиск по справочнику
                </label>
                <Input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Поиск по справочнику"
                  autoComplete="off"
                  aria-controls={listId}
                  className="bg-background"
                />
              </div>
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground" role="status">
                {filteredOptions.length > 0 ? (
                  <>
                    Показано {visibleOptions.length} из {filteredOptions.length}
                    {hiddenOptionsCount > 0 ? ' — уточните поиск' : ''}
                  </>
                ) : (
                  'По запросу ничего не найдено.'
                )}
              </div>
              {visibleOptions.length > 0
                ? visibleOptions.map((option, idx) => (
                    <Button
                      key={option.id}
                      ref={(node) => {
                        optionRefs.current[idx] = node;
                      }}
                      type="button"
                      onClick={() => insertOption(option)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setOpen(false);
                          setQuery('');
                        }
                      }}
                      variant="ghost"
                      className={cn(
                        'flex h-auto w-full min-w-0 flex-col items-start rounded-none',
                        'px-2.5 py-1.5 text-left whitespace-normal hover:bg-primary/10',
                        idx > 0 && 'border-t border-border',
                      )}
                    >
                      <span className="line-clamp-2 max-w-full break-words text-sm font-semibold text-foreground">
                        {option.title}
                      </span>
                      {option.meta ? (
                        <span className={cn(hintClass, 'max-w-full break-words')}>
                          {option.meta}
                        </span>
                      ) : null}
                      {option.body ? (
                        <span className="line-clamp-2 max-w-full break-words text-xs text-muted-foreground">
                          {option.body}
                        </span>
                      ) : null}
                    </Button>
                  ))
                : null}
            </>
          ) : (
            <div className="px-2.5 py-1.5 text-xs text-muted-foreground">
              В справочнике пока нет активных вариантов.
            </div>
          )}
        </div>
      ) : null}
      <Textarea
        id={textareaId}
        className="min-h-[38px]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
      />
    </div>
  );
}
