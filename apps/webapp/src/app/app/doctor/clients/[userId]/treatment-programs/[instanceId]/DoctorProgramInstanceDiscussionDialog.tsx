"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/doctor/primitives/dialog";
import { Label } from "@/shared/ui/doctor/primitives/label";
import type { ReferenceItemDto } from "@/modules/references/referenceCache";
import { ReferenceSelect } from "@/shared/ui/doctor/ReferenceSelect";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { DoctorProgramDiscussionMessagesPanel } from "./DoctorProgramDiscussionMessagesPanel";
import { markDoctorProgramDiscussionReadForStageItems } from "@/app/app/doctor/doctorProgramDiscussionMarkRead";
import { sendDoctorProgramDiscussionReply } from "./doctorProgramDiscussionReply";

export const DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS = "__all__";

export type DoctorProgramInstanceDiscussionItemOption = {
  id: string;
  label: string;
};

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
    stageItemIdFilter?: string | null;
  };
  peerLastReadAtByStageItemId?: Record<string, string | null>;
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

function uniqueStageItemIds(messages: ProgramItemDiscussionMessage[]): string[] {
  return [...new Set(messages.map((m) => m.instanceStageItemId))];
}

export function DoctorProgramInstanceDiscussionDialog(props: {
  instanceId: string;
  programItems: DoctorProgramInstanceDiscussionItemOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { instanceId, programItems, open, onOpenChange } = props;
  const [filterStageItemId, setFilterStageItemId] = useState<string>(DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS);
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messageCountByItemId, setMessageCountByItemId] = useState<Record<string, number>>({});
  const [peerLastReadAtByStageItemId, setPeerLastReadAtByStageItemId] = useState<Record<string, string | null>>(
    {},
  );
  const loadGenerationRef = useRef(0);
  const filterStageItemIdRef = useRef(filterStageItemId);

  const itemLabelById = useMemo(() => new Map(programItems.map((item) => [item.id, item.label])), [programItems]);

  const formatItemOptionLabel = useCallback(
    (item: DoctorProgramInstanceDiscussionItemOption) => {
      const count = messageCountByItemId[item.id];
      return count != null && count > 0 ? `${item.label} (${count})` : item.label;
    },
    [messageCountByItemId],
  );

  const filterItems = useMemo<ReferenceItemDto[]>(
    () =>
      programItems.map((item, index) => ({
        id: item.id,
        code: item.id,
        title: formatItemOptionLabel(item),
        sortOrder: index,
      })),
    [formatItemOptionLabel, programItems],
  );

  const basePath = useMemo(
    () => `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion`,
    [instanceId],
  );

  const loadPage = useCallback(
    async (
      cursor: string | null,
      appendOlder: boolean,
      stageItemId: string,
      generation: number,
    ): Promise<ProgramItemDiscussionMessage[] | null> => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set("direction", "backward");
      url.searchParams.set("limit", "50");
      if (stageItemId !== DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS) {
        url.searchParams.set("stageItemId", stageItemId);
      }
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (generation !== loadGenerationRef.current) return null;
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(data?.error ?? "Не удалось загрузить обсуждения");
      }
      const loaded = data.messages;
      setMessages((prev) => {
        if (!appendOlder) return loaded;
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const msg of loaded) map.set(msg.id, msg);
        return [...map.values()].sort(compareMessages);
      });
      setNextCursor(typeof data.pageInfo?.nextCursor === "string" ? data.pageInfo.nextCursor : null);
      if (data.peerLastReadAtByStageItemId) {
        setPeerLastReadAtByStageItemId((prev) => ({ ...prev, ...data.peerLastReadAtByStageItemId }));
      }
      return loaded;
    },
    [basePath],
  );

  const markVisibleDiscussionRead = useCallback(
    (loaded: ProgramItemDiscussionMessage[], stageItemIdFilter: string) => {
      const stageItemIds =
        stageItemIdFilter !== DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS
          ? [stageItemIdFilter]
          : uniqueStageItemIds(loaded);
      void markDoctorProgramDiscussionReadForStageItems({ instanceId, stageItemIds });
    },
    [instanceId],
  );

  const bootstrap = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadingOlder(false);
    setError(null);
    setMessages([]);
    setNextCursor(null);
    try {
      const loaded = await loadPage(null, false, filterStageItemId, generation);
      if (loaded) {
        markVisibleDiscussionRead(loaded, filterStageItemId);
      }
    } catch (e) {
      if (generation !== loadGenerationRef.current) return;
      const msg = e instanceof Error ? e.message : "Не удалось загрузить обсуждения";
      setError(msg);
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [filterStageItemId, loadPage, markVisibleDiscussionRead]);

  const refreshSummary = useCallback(async (generation: number = loadGenerationRef.current) => {
    try {
      const url = new URL(`${basePath}/summary`, window.location.origin);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        summaryByStageItemId?: Record<string, { totalCount?: number }>;
      } | null;
      if (!res.ok || !data?.ok || !data.summaryByStageItemId) return;
      if (generation !== loadGenerationRef.current) return;
      const next: Record<string, number> = {};
      for (const [id, summary] of Object.entries(data.summaryByStageItemId)) {
        const count = summary?.totalCount;
        if (typeof count === "number" && Number.isFinite(count) && count > 0) {
          next[id] = Math.floor(count);
        }
      }
      if (generation !== loadGenerationRef.current) return;
      setMessageCountByItemId(next);
    } catch {
      // summary prefetch is best-effort
    }
  }, [basePath]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  useEffect(() => {
    filterStageItemIdRef.current = filterStageItemId;
  }, [filterStageItemId]);

  useEffect(() => {
    if (!open) {
      loadGenerationRef.current += 1;
      setFilterStageItemId(DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS);
      setMessages([]);
      setLoading(false);
      setLoadingOlder(false);
      setNextCursor(null);
      setError(null);
      setMessageCountByItemId({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refreshSummary(loadGenerationRef.current);
  }, [open, refreshSummary]);

  useEffect(() => {
    if (!open) return;
    const refreshPeerRead = async () => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set("direction", "backward");
      url.searchParams.set("limit", "1");
      if (filterStageItemIdRef.current !== DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS) {
        url.searchParams.set("stageItemId", filterStageItemIdRef.current);
      }
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (res.ok && data?.ok && data.peerLastReadAtByStageItemId) {
        setPeerLastReadAtByStageItemId((prev) => ({ ...prev, ...data.peerLastReadAtByStageItemId }));
      }
    };
    const id = window.setInterval(() => void refreshPeerRead(), 15000);
    return () => window.clearInterval(id);
  }, [open, basePath]);

  const showItemLabels = filterStageItemId === DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Обсуждения по программе</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid gap-2">
            <Label htmlFor="doctor-instance-discussion-item-filter">Пункт программы</Label>
            <div data-testid="doctor-instance-discussion-item-filter">
              <ReferenceSelect
                id="doctor-instance-discussion-item-filter"
                prefetchedItems={filterItems}
                valueMatch="id"
                submitField="id"
                value={filterStageItemId === DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS ? null : filterStageItemId}
                onChange={(nextValue) => {
                  setFilterStageItemId(nextValue ?? DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS);
                }}
                placeholder="Все пункты"
                clearOptionLabel="Все пункты"
                showAllOnFocus
              />
            </div>
          </div>
          <DoctorProgramDiscussionMessagesPanel
            messages={messages}
            loading={loading}
            loadingOlder={loadingOlder}
            error={error}
            nextCursor={nextCursor}
            peerLastReadAtByStageItemId={peerLastReadAtByStageItemId}
            itemLabelById={showItemLabels ? itemLabelById : undefined}
            onSelectItemFilter={(stageItemId) => setFilterStageItemId(stageItemId)}
            onSendReply={async (stageItemId, text) => {
              const sendResult = await sendDoctorProgramDiscussionReply({
                instanceId,
                stageItemId,
                text,
              });
              if (!sendResult.ok) return sendResult;

              const generation = loadGenerationRef.current;
              const currentFilter = filterStageItemIdRef.current;
              const shouldReloadThread =
                currentFilter === DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS || currentFilter === stageItemId;
              try {
                if (shouldReloadThread) {
                  await loadPage(null, false, currentFilter, generation);
                }
              } catch {
                if (generation === loadGenerationRef.current) {
                  setError("Ответ отправлен, но список не обновился. Откройте обсуждение заново.");
                }
              }
              void refreshSummary(generation);
              return { ok: true as const };
            }}
            onLoadOlder={() => {
              if (!nextCursor) return;
              const generation = loadGenerationRef.current;
              setLoadingOlder(true);
              void loadPage(nextCursor, true, filterStageItemId, generation)
                .then((loaded) => {
                  if (loaded) markVisibleDiscussionRead(loaded, filterStageItemId);
                })
                .catch((e) => {
                  if (generation !== loadGenerationRef.current) return;
                  setError(e instanceof Error ? e.message : "Не удалось загрузить обсуждения");
                })
                .finally(() => {
                  if (generation === loadGenerationRef.current) {
                    setLoadingOlder(false);
                  }
                });
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
