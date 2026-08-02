'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardList, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/doctor/primitives/tooltip';
import { DoctorChatPanel } from '@/modules/messaging/components/DoctorChatPanel';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  DoctorDnaFlatListSelectionStrip,
  doctorDnaFlatListClass,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListInsetClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  doctorDnaFlatListSelectedPrimaryClass,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { patientCardHref } from '../patients/patientCardHref';
import { ChatClientOverviewPanel } from './ChatClientOverviewPanel';

const POLL_INTERVAL_MS = 1_000;

type ConvRow = {
  conversationId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNormalized: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastSenderRole: string | null;
  unreadFromUserCount: number;
  hasUnreadFromUser: boolean;
  onSupport: boolean;
  /** #813: null for non-webapp-platform conversations (e.g. Telegram/MAX) — no patient card to open. */
  patientUserId: string | null;
};

type ConversationApiRow = {
  conversationId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  phoneNormalized: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
  lastSenderRole: string | null;
  unreadFromUserCount?: number;
  hasUnreadFromUser?: boolean;
  onSupport?: boolean;
  patientUserId?: string | null;
};

function formatConversationTime(value: string, tz = 'Europe/Moscow'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const time = date.toLocaleString('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  const dayMonth = date.toLocaleString('ru-RU', { timeZone: tz, day: '2-digit', month: '2-digit' });
  return `${dayMonth} · ${time}`;
}

function getSenderPrefix(conv: ConvRow): string {
  if (conv.lastSenderRole === 'admin') return 'Вы';
  return conv.firstName || (conv.displayName.split(' ')[0] ?? '').trim() || 'Пациент';
}

function mapConvRows(conversations: ConversationApiRow[]): ConvRow[] {
  return conversations.map((c) => ({
    conversationId: c.conversationId,
    displayName: c.displayName,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    phoneNormalized: c.phoneNormalized,
    lastMessageAt: c.lastMessageAt,
    lastMessageText: c.lastMessageText,
    lastSenderRole: c.lastSenderRole,
    unreadFromUserCount: c.unreadFromUserCount ?? 0,
    hasUnreadFromUser: c.hasUnreadFromUser ?? (c.unreadFromUserCount ?? 0) > 0,
    onSupport: c.onSupport ?? false,
    patientUserId: c.patientUserId ?? null,
  }));
}

/**
 * Owner punch-list (2026-07-25) item 2: the standalone «Сигналы пациентов» card on «Сегодня»
 * was removed, but the underlying signal mechanism (doctor-proactive-insights) is kept — it now
 * surfaces here as an «внимание» attention mark on the patient's conversation row, with a
 * tooltip carrying the reason(s) (which signal(s) fired).
 */
type PatientSignal = { kind: string; summary: string };

function convSignature(rows: ConvRow[]): string {
  return rows
    .map(
      (r) =>
        `${r.conversationId}:${r.lastMessageAt}:${r.unreadFromUserCount}:${r.onSupport ? '1' : '0'}`,
    )
    .join('|');
}

export type DoctorSupportInboxProps = {
  active?: boolean;
  displayIana?: string;
  /** #812: deep-link ?id= from the Communications shell — opens this conversation on mount. */
  initialSelectedConversationId?: string | null;
  /** #812: called on every selection change so the shell can keep ?id= in sync (shareable URL). */
  onSelectedConversationChange?: (id: string | null) => void;
};

type FilterMode = 'all' | 'unread' | 'onSupport';

export function DoctorSupportInbox({
  active = true,
  displayIana = 'Europe/Moscow',
  initialSelectedConversationId = null,
  onSelectedConversationChange,
}: DoctorSupportInboxProps) {
  const [allList, setAllList] = useState<ConvRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'name' | 'text'>('name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [signalsByPatient, setSignalsByPatient] = useState<Map<string, PatientSignal[]>>(new Map());
  const sigRef = useRef<string>('');
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Owner punch-list item 2: load per-patient attention signals once — best-effort, does not
  // block or gate the conversation list itself (kept out of the 1s poll loop below).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/doctor/proactive-insights/by-patient');
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          items?: { patientUserId: string; kind: string; summary: string }[];
        };
        if (cancelled || !data.ok || !data.items) return;
        const map = new Map<string, PatientSignal[]>();
        for (const item of data.items) {
          const list = map.get(item.patientUserId) ?? [];
          list.push({ kind: item.kind, summary: item.summary });
          map.set(item.patientUserId, list);
        }
        setSignalsByPatient(map);
      } catch {
        // best-effort — attention marks are a nice-to-have, not worth surfacing an error for.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep-link: открыть конкретный диалог из URL. Реагируем только на ВНЕШНИЙ deep-link — если диалог уже
  // выбран (echo от нашего же onSelectedConversationChange после клика), не перезапускаем.
  useEffect(() => {
    const id = initialSelectedConversationId?.trim();
    if (!id) return;
    if (selectedIdRef.current === id) return;
    setSelectedId(id);
  }, [initialSelectedConversationId]);

  const selectConversation = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      onSelectedConversationChange?.(id);
    },
    [onSelectedConversationChange],
  );

  useEffect(() => {
    setOverviewOpen(false);
  }, [selectedId]);

  const fetchList = useCallback(async (): Promise<ConvRow[] | null> => {
    try {
      const url = new URL('/api/doctor/messages/conversations', window.location.origin);
      const res = await fetch(url.toString());
      const data = (await res.json()) as {
        ok?: boolean;
        conversations?: ConversationApiRow[];
      };
      if (!res.ok || !data.ok || !data.conversations) return null;
      return mapConvRows(data.conversations);
    } catch {
      return null;
    }
  }, []);

  const loadList = useCallback(async () => {
    setError(null);
    const rows = await fetchList();
    if (rows === null) {
      setError('Не удалось загрузить диалоги');
      setAllList([]);
      sigRef.current = '';
    } else {
      sigRef.current = convSignature(rows);
      setAllList(rows);
    }
  }, [fetchList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await loadList();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  useEffect(() => {
    if (!active) return;

    const pollOnce = async () => {
      const rows = await fetchList();
      if (rows === null) return;
      const sig = convSignature(rows);
      if (sig === sigRef.current) return;
      sigRef.current = sig;
      setAllList(rows);
    };

    let timerId: ReturnType<typeof setInterval> | null = null;

    const startInterval = () => {
      if (timerId !== null) return;
      timerId = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void pollOnce();
        startInterval();
      } else {
        stopInterval();
      }
    };

    if (document.visibilityState === 'visible') startInterval();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [active, fetchList]);

  const unreadCount = allList.filter((c) => c.unreadFromUserCount > 0).length;
  const onSupportCount = allList.filter((c) => c.onSupport).length;

  const filteredByChip =
    filter === 'unread'
      ? allList.filter((c) => c.unreadFromUserCount > 0)
      : filter === 'onSupport'
        ? allList.filter((c) => c.onSupport)
        : allList;

  const filteredList = query.trim()
    ? filteredByChip.filter((c) => {
        const q = query.toLowerCase();
        if (searchMode === 'name') {
          const searchable = [c.lastName, c.firstName, c.displayName, c.phoneNormalized]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return searchable.includes(q);
        }
        return (c.lastMessageText ?? '').toLowerCase().includes(q);
      })
    : filteredByChip;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  const selectedConv = selectedId
    ? (allList.find((c) => c.conversationId === selectedId) ?? null)
    : null;
  const selectedConvDisplayName = selectedConv
    ? (selectedConv.lastName ?? selectedConv.firstName)
      ? [selectedConv.lastName, selectedConv.firstName].filter(Boolean).join(' ')
      : selectedConv.displayName
    : '';

  const leftPane = (
    <div
      data-doctor-flat-list-surface
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      {/* Header: search bar, then filter chips below */}
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-muted/20 px-3 py-2">
        <div className="flex gap-1.5">
          <Input
            type="search"
            placeholder={
              searchMode === 'name'
                ? 'Поиск по имени / телефону'
                : 'Поиск по тексту последнего сообщения'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 min-w-0 flex-1"
            aria-label={
              searchMode === 'name'
                ? 'Поиск по имени пациента'
                : 'Поиск по тексту последнего сообщения'
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            title={
              searchMode === 'name'
                ? 'Переключить на поиск по тексту сообщений'
                : 'Переключить на поиск по имени'
            }
            onClick={() => {
              setSearchMode((m) => (m === 'name' ? 'text' : 'name'));
              setQuery('');
            }}
            className={cn(
              'shrink-0 text-xs',
              searchMode === 'text' && 'border-primary/40 bg-primary/10 text-primary',
            )}
          >
            {searchMode === 'name' ? 'Аб' : '✉'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant={filter === 'unread' ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => setFilter(filter === 'unread' ? 'all' : 'unread')}
            className={cn(
              'shrink-0 text-xs',
              filter === 'unread' &&
                'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
            aria-pressed={filter === 'unread'}
          >
            Непрочитанные · {unreadCount}
          </Button>
          <Button
            type="button"
            variant={filter === 'onSupport' ? 'ghost' : 'outline'}
            size="sm"
            onClick={() => setFilter(filter === 'onSupport' ? 'all' : 'onSupport')}
            className={cn(
              'shrink-0 text-xs',
              filter === 'onSupport' &&
                'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
            )}
            aria-pressed={filter === 'onSupport'}
          >
            ★ На сопровождении · {onSupportCount}
          </Button>
        </div>
      </div>

      {error && (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {/* Conversation rows */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
            {query.trim()
              ? 'Ничего не найдено'
              : filter === 'unread'
                ? 'Нет непрочитанных диалогов'
                : filter === 'onSupport'
                  ? 'Нет диалогов на сопровождении'
                  : 'Нет открытых диалогов'}
          </div>
        ) : (
          <ul className={cn(doctorDnaFlatListClass, doctorDnaFlatListInsetClass, 'flex flex-col')}>
            {filteredList.map((c, index) => {
              const isSelected = selectedId === c.conversationId;
              const patientSignals = c.patientUserId
                ? (signalsByPatient.get(c.patientUserId) ?? null)
                : null;
              return (
                <li key={c.conversationId}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => selectConversation(c.conversationId)}
                    className={cn(
                      doctorDnaFlatListRowClass,
                      doctorDnaFlatListClickableClass,
                      'h-auto w-full rounded-none bg-transparent text-left shadow-none',
                      index === 0 && 'border-t-0',
                    )}
                  >
                    {isSelected ? <DoctorDnaFlatListSelectionStrip /> : null}
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'min-w-0 truncate',
                            doctorDnaFlatListPrimaryClass,
                            isSelected && doctorDnaFlatListSelectedPrimaryClass,
                          )}
                        >
                          {(c.lastName ?? c.firstName)
                            ? [c.lastName, c.firstName].filter(Boolean).join(' ')
                            : c.displayName || 'Без имени'}
                          {c.onSupport && (
                            <span className="ml-1.5 text-[10px] font-semibold text-primary">★</span>
                          )}
                          {patientSignals && patientSignals.length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span
                                    className="ml-1.5 inline-flex translate-y-[-1px] items-center text-destructive"
                                    aria-label={`Внимание: ${patientSignals.map((s) => s.summary).join('; ')}`}
                                  >
                                    <AlertTriangle className="size-3" aria-hidden />
                                  </span>
                                }
                              />
                              <TooltipContent>
                                {patientSignals.map((s) => s.summary).join('; ')}
                              </TooltipContent>
                            </Tooltip>
                          ) : null}
                        </span>
                        <span className={cn('shrink-0', doctorDnaFlatListMetaClass)}>
                          {formatConversationTime(c.lastMessageAt, displayIana)}
                        </span>
                      </div>
                      {(c.lastName ?? c.firstName) && (
                        <p className={cn('truncate', doctorDnaFlatListMetaClass)}>
                          {c.displayName}
                        </p>
                      )}
                      {c.lastMessageText && (
                        <p className={cn('mt-0.5 truncate', doctorDnaFlatListMetaClass)}>
                          <span className="font-medium text-foreground/80">
                            {getSenderPrefix(c)}:
                          </span>{' '}
                          {c.lastMessageText}
                        </p>
                      )}
                    </div>
                    {c.unreadFromUserCount > 0 && (
                      <span className="self-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        {c.unreadFromUserCount}
                      </span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {overviewOpen && selectedConv?.patientUserId ? (
        <ChatClientOverviewPanel
          patientUserId={selectedConv.patientUserId}
          patientDisplayName={selectedConvDisplayName}
          onClose={() => setOverviewOpen(false)}
        />
      ) : null}
    </div>
  );

  const rightPane = (
    <div className="flex min-h-[300px] flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {!selectedId ? (
        <DoctorEmptyState size="sm" className="flex-1 items-center justify-center px-6 text-center">
          <span className="font-semibold text-foreground">Выберите чат слева</span>
          <span>Когда диалог выбран — здесь появляется тред переписки с полем ответа</span>
        </DoctorEmptyState>
      ) : (
        <>
          {/* Thread header: patient name is the single card-navigation affordance. */}
          <div className="shrink-0 flex items-center gap-2 border-b border-border px-3 py-2">
            {selectedConv?.patientUserId ? (
              <Link
                href={patientCardHref(selectedConv.patientUserId)}
                className={cn(doctorInlineLinkClass, 'min-w-0 flex-1 truncate text-sm font-medium')}
              >
                {selectedConvDisplayName || '—'}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {selectedConvDisplayName || '—'}
              </span>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!selectedConv?.patientUserId}
              onClick={() => setOverviewOpen(true)}
              className="shrink-0 gap-1.5"
            >
              <ClipboardList size={14} aria-hidden />
              Обзор и записи
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => selectConversation(null)}
              aria-label="Закрыть тред"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </Button>
          </div>
          <DoctorChatPanel
            key={selectedId}
            conversationId={selectedId}
            className="flex-1 min-h-0"
            onReadStateChanged={loadList}
            onSent={loadList}
          />
        </>
      )}
    </div>
  );

  return (
    <CatalogSplitLayout
      left={leftPane}
      right={rightPane}
      mobileView={overviewOpen ? 'list' : selectedId ? 'detail' : 'list'}
      mobileBackSlot={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => selectConversation(null)}
          className="mb-2 h-9 px-2"
        >
          ← К списку
        </Button>
      }
      desktopColsClassName="lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]"
      className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
    />
  );
}
