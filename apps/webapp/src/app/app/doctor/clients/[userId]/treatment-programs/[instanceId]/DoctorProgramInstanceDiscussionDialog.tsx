"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { DoctorProgramDiscussionMessagesPanel } from "./DoctorProgramDiscussionMessagesPanel";

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
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

export function DoctorProgramInstanceDiscussionDialog(props: {
  instanceId: string;
  programItems: DoctorProgramInstanceDiscussionItemOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { instanceId, programItems, open, onOpenChange } = props;
  const [filterStageItemId, setFilterStageItemId] = useState<string>(DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS);
  const [itemSearch, setItemSearch] = useState("");
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [messageCountByItemId, setMessageCountByItemId] = useState<Record<string, number>>({});

  const itemLabelById = useMemo(() => new Map(programItems.map((item) => [item.id, item.label])), [programItems]);

  const formatItemOptionLabel = useCallback(
    (item: DoctorProgramInstanceDiscussionItemOption) => {
      const count = messageCountByItemId[item.id];
      return count != null && count > 0 ? `${item.label} (${count})` : item.label;
    },
    [messageCountByItemId],
  );

  const filteredItemOptions = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return programItems;
    return programItems.filter((item) => item.label.toLowerCase().includes(query));
  }, [programItems, itemSearch]);

  const selectedFilterLabel = useMemo(() => {
    if (filterStageItemId === DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS) return "Все пункты";
    const base = itemLabelById.get(filterStageItemId) ?? "Пункт";
    const count = messageCountByItemId[filterStageItemId];
    return count != null && count > 0 ? `${base} (${count})` : base;
  }, [filterStageItemId, itemLabelById, messageCountByItemId]);

  const basePath = useMemo(
    () => `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/discussion`,
    [instanceId],
  );

  const loadPage = useCallback(
    async (cursor: string | null, appendOlder: boolean, stageItemId: string) => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set("direction", "backward");
      url.searchParams.set("limit", "50");
      if (stageItemId !== DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS) {
        url.searchParams.set("stageItemId", stageItemId);
      }
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
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
    },
    [basePath],
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessages([]);
    setNextCursor(null);
    try {
      await loadPage(null, false, filterStageItemId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось загрузить обсуждения";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filterStageItemId, loadPage]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  useEffect(() => {
    if (!open) {
      setFilterStageItemId(DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS);
      setItemSearch("");
      setMessages([]);
      setNextCursor(null);
      setError(null);
      setMessageCountByItemId({});
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const url = new URL(`${basePath}/summary`, window.location.origin);
        const res = await fetch(url.toString());
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          summaryByStageItemId?: Record<string, { totalCount?: number }>;
        } | null;
        if (!res.ok || !data?.ok || !data.summaryByStageItemId || cancelled) return;
        const next: Record<string, number> = {};
        for (const [id, summary] of Object.entries(data.summaryByStageItemId)) {
          const count = summary?.totalCount;
          if (typeof count === "number" && Number.isFinite(count) && count > 0) {
            next[id] = Math.floor(count);
          }
        }
        if (!cancelled) setMessageCountByItemId(next);
      } catch {
        // summary prefetch is best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
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
            <Label htmlFor="doctor-instance-discussion-item-search">Пункт программы</Label>
            <Input
              id="doctor-instance-discussion-item-search"
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Поиск пункта"
              data-testid="doctor-instance-discussion-item-search"
            />
            <Select
              value={filterStageItemId}
              onValueChange={(value) => {
                if (!value) return;
                setFilterStageItemId(value);
              }}
              items={[
                { value: DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS, label: "Все пункты" },
                ...filteredItemOptions.map((item) => ({
                  value: item.id,
                  label: formatItemOptionLabel(item),
                })),
              ]}
            >
              <SelectTrigger
                id="doctor-instance-discussion-item-filter"
                className="w-full"
                displayLabel={selectedFilterLabel}
                data-testid="doctor-instance-discussion-item-filter"
              />
              <SelectContent>
                <SelectItem value={DOCTOR_INSTANCE_DISCUSSION_ALL_ITEMS}>Все пункты</SelectItem>
                {filteredItemOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id} label={formatItemOptionLabel(item)}>
                    {formatItemOptionLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DoctorProgramDiscussionMessagesPanel
            messages={messages}
            loading={loading}
            loadingOlder={loadingOlder}
            error={error}
            nextCursor={nextCursor}
            itemLabelById={showItemLabels ? itemLabelById : undefined}
            onLoadOlder={() => {
              if (!nextCursor) return;
              setLoadingOlder(true);
              void loadPage(nextCursor, true, filterStageItemId)
                .catch((e) => {
                  setError(e instanceof Error ? e.message : "Не удалось загрузить обсуждения");
                })
                .finally(() => setLoadingOlder(false));
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
