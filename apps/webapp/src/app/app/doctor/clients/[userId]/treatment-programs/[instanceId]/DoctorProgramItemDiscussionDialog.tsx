"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProgramItemDiscussionMessage } from "@/modules/program-item-discussion/types";
import { DoctorProgramDiscussionMessagesPanel } from "./DoctorProgramDiscussionMessagesPanel";

type DiscussionPageResponse = {
  ok?: boolean;
  error?: string;
  messages?: ProgramItemDiscussionMessage[];
  pageInfo?: {
    nextCursor?: string | null;
  };
};

function compareMessages(a: ProgramItemDiscussionMessage, b: ProgramItemDiscussionMessage): number {
  const byDate = a.createdAt.localeCompare(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

export function DoctorProgramItemDiscussionDialog(props: {
  instanceId: string;
  itemId: string;
  itemLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { instanceId, itemId, itemLabel, open, onOpenChange } = props;
  const [messages, setMessages] = useState<ProgramItemDiscussionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const basePath = useMemo(
    () =>
      `/api/doctor/treatment-program-instances/${encodeURIComponent(instanceId)}/items/${encodeURIComponent(itemId)}/discussion`,
    [instanceId, itemId],
  );

  const loadPage = useCallback(
    async (cursor: string | null, appendOlder: boolean) => {
      const url = new URL(basePath, window.location.origin);
      url.searchParams.set("direction", "backward");
      url.searchParams.set("limit", "50");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString());
      const data = (await res.json().catch(() => null)) as DiscussionPageResponse | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.messages)) {
        throw new Error(data?.error ?? "Не удалось загрузить обсуждение");
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
    try {
      await loadPage(null, false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось загрузить обсуждение";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    if (!open) return;
    void bootstrap();
  }, [open, bootstrap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{itemLabel ? `Обсуждение: ${itemLabel}` : "Обсуждение"}</DialogTitle>
        </DialogHeader>
        <DoctorProgramDiscussionMessagesPanel
          messages={messages}
          loading={loading}
          loadingOlder={loadingOlder}
          error={error}
          nextCursor={nextCursor}
          onLoadOlder={() => {
            if (!nextCursor) return;
            setLoadingOlder(true);
            void loadPage(nextCursor, true)
              .catch((e) => {
                setError(e instanceof Error ? e.message : "Не удалось загрузить обсуждение");
              })
              .finally(() => setLoadingOlder(false));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
