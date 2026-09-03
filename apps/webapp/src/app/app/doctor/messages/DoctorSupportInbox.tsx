'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ClipboardList, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorSearchInput } from '@/shared/ui/doctor/DoctorSearchInput';
import { DoctorChatPanel } from '@/modules/messaging/components/DoctorChatPanel';
import { DoctorConversationChatModal } from '@/modules/messaging/components/DoctorConversationChatModal';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { doctorDnaFlatListClass } from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { DoctorConversationListRow } from '@/modules/messaging/components/DoctorConversationListRow';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { doctorInlineLinkClass } from '@/shared/ui/doctor/doctorVisual';
import {
  DOCTOR_MOBILE_SCROLL_END_INSET_CLASS,
  DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { patientCardHref } from '../patients/patientCardHref';
import { ChatClientOverviewPanel } from './ChatClientOverviewPanel';

const POLL_INTERVAL_MS = 15_000;

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

export function DoctorSupportInbox({
  active = true,
  displayIana = 'Europe/Moscow',
  initialSelectedConversationId = null,
  onSelectedConversationChange,
}: DoctorSupportInboxProps) {
  const [allList, setAllList] = useState<ConvRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const hasSplitChat = useViewportMinWidth(1024);
  const [mobileToolbarTarget, setMobileToolbarTarget] = useState<HTMLElement | null>(null);
  const sigRef = useRef<string>('');
  const selectedIdRef = useRef<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listRequestRef = useRef<Promise<ConvRow[] | null> | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Deep-link: открыть конкретный диалог из URL. Реагируем только на внешний deep-link — если диалог уже
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

  useEffect(() => {
    if (!active) {
      setMobileToolbarTarget(null);
      return;
    }
    setMobileToolbarTarget(document.getElementById('doctor-communications-mobile-toolbar'));
  }, [active]);

  useEffect(() => {
    if (!active || loading) return;
    const mobileMedia = window.matchMedia('(max-width: 767px)');
    const alignListStart = () => {
      if (mobileMedia.matches && listScrollRef.current) {
        listScrollRef.current.scrollTop = 0;
      }
    };
    alignListStart();
    mobileMedia.addEventListener('change', alignListStart);
    return () => mobileMedia.removeEventListener('change', alignListStart);
  }, [active, loading]);

  const fetchList = useCallback((): Promise<ConvRow[] | null> => {
    if (listRequestRef.current) return listRequestRef.current;

    const request = (async (): Promise<ConvRow[] | null> => {
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
    })();

    listRequestRef.current = request;
    void request.finally(() => {
      if (listRequestRef.current === request) listRequestRef.current = null;
    });
    return request;
  }, []);

  const loadList = useCallback(async () => {
    setError(null);
    const rows = await fetchList();
    if (rows === null) {
      setError('Не удалось загрузить диалоги');
      setAllList([]);
    } else {
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
    if (!active || selectedId) return;

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
  }, [active, fetchList, selectedId]);

  const filteredList = query.trim()
    ? allList.filter((c) => {
        const q = query.trim().toLocaleLowerCase('ru-RU');
        const searchable = [c.lastName, c.firstName, c.displayName, c.lastMessageText]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('ru-RU');
        return searchable.includes(q);
      })
    : allList;

  if (loading) {
    return <DoctorPanelLoading className="h-full" />;
  }

  const selectedConv = selectedId
    ? (allList.find((c) => c.conversationId === selectedId) ?? null)
    : null;
  const selectedConvDisplayName = selectedConv
    ? (selectedConv.lastName ?? selectedConv.firstName)
      ? [selectedConv.lastName, selectedConv.firstName].filter(Boolean).join(' ')
      : selectedConv.displayName
    : '';

  const renderListControls = () => (
    <DoctorSearchInput
      placeholder="Поиск по клиенту и сообщению"
      value={query}
      onValueChange={setQuery}
      onClear={() => setQuery('')}
      aria-label="Поиск по клиенту и сообщению"
    />
  );

  const leftPane = (
    <div
      data-doctor-flat-list-surface
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-card md:rounded-lg md:border md:border-border"
    >
      <div className="hidden shrink-0 border-b border-border bg-muted/20 px-3 py-2 md:block">
        {renderListControls()}
      </div>

      {error && (
        <p className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {/* Conversation rows */}
      <div ref={listScrollRef} className="flex flex-1 flex-col overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted-foreground">
            {query.trim() ? 'Ничего не найдено' : 'Нет открытых диалогов'}
          </div>
        ) : (
          <ul
            className={cn(
              doctorDnaFlatListClass,
              DOCTOR_MOBILE_SCROLL_END_INSET_CLASS,
              'mx-0 flex flex-col md:mx-[var(--doctor-block-padding,18px)]',
            )}
          >
            {filteredList.map((c) => {
              const isSelected = selectedId === c.conversationId;
              return (
                <li key={c.conversationId}>
                  <DoctorConversationListRow
                    conversation={c}
                    displayIana={displayIana}
                    selected={isSelected}
                    onClick={() => selectConversation(c.conversationId)}
                  />
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
          {hasSplitChat ? (
            <DoctorChatPanel
              key={selectedId}
              conversationId={selectedId}
              className="min-h-0 flex-1"
              onReadStateChanged={loadList}
              onSent={loadList}
            />
          ) : null}
        </>
      )}
    </div>
  );

  return (
    <>
      {mobileToolbarTarget ? createPortal(renderListControls(), mobileToolbarTarget) : null}
      <CatalogSplitLayout
        mobileEdgeToEdge
        left={leftPane}
        right={rightPane}
        mobileView={hasSplitChat && selectedId ? 'detail' : 'list'}
        desktopColsClassName="lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]"
        className={cn(DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS, 'min-h-0 flex-1 md:flex-none')}
      />
      <DoctorConversationChatModal
        conversationId={!hasSplitChat ? selectedId : null}
        displayName={selectedConvDisplayName}
        onClose={() => selectConversation(null)}
        onReadStateChanged={loadList}
        onSent={loadList}
      />
    </>
  );
}
