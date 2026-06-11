"use client";

import { useCallback, useEffect, useState } from "react";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import { listBroadcastAuditAction } from "../../broadcasts/actions";
import { BroadcastForm } from "../../broadcasts/BroadcastForm";
import { BroadcastAuditLog } from "../../broadcasts/BroadcastAuditLog";
import { BroadcastDeliveryArchiveClient } from "../../broadcasts/BroadcastDeliveryArchiveClient";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  doctorInlineLinkClass,
  doctorPageStackClass,
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/** Таб «Рассылки». ?archive=1 → архив ошибок доставки. */
export function BroadcastsTab({ deepLinkParams, onDeepLinkChange }: CommunicationsTabProps) {
  if (deepLinkParams.archive === "1") {
    return (
      <div className={doctorPageStackClass}>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDeepLinkChange("archive", null)}
          >
            ← Рассылки
          </Button>
        </div>
        <BroadcastDeliveryArchiveClient />
      </div>
    );
  }

  return <BroadcastsMainView onArchive={() => onDeepLinkChange("archive", "1")} />;
}

function BroadcastsMainView({ onArchive }: { onArchive: () => void }) {
  const [entries, setEntries] = useState<BroadcastAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshLog = useCallback(async () => {
    const data = await listBroadcastAuditAction(50);
    setEntries(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await listBroadcastAuditAction(50);
      if (!cancelled) {
        setEntries(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={doctorPageStackClass}>
      <p className="text-sm text-muted-foreground">
        После отправки сообщения ставятся в очередь доставки; счётчики в журнале обновляются по
        мере работы воркера.{" "}
        <button type="button" onClick={onArchive} className={doctorInlineLinkClass}>
          Архив ошибок доставки
        </button>
      </p>
      <section className={doctorSectionCardClass}>
        <h2 className={`mb-3 ${doctorSectionTitleClass}`}>Новая рассылка</h2>
        <BroadcastForm onBroadcastSent={() => void refreshLog()} />
      </section>
      <section className={doctorSectionCardClass}>
        <h2 className={`mb-3 ${doctorSectionTitleClass}`}>Журнал рассылок</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <BroadcastAuditLog entries={entries} />
        )}
      </section>
    </div>
  );
}
