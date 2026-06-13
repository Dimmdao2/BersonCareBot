"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { BroadcastAuditEntry } from "@/modules/doctor-broadcasts/ports";
import { listBroadcastAuditAction } from "../../broadcasts/actions";
import { BroadcastForm, type BroadcastFormPrefill } from "../../broadcasts/BroadcastForm";
import { BroadcastAuditLog } from "../../broadcasts/BroadcastAuditLog";
import { BroadcastDeliveryArchiveClient } from "../../broadcasts/BroadcastDeliveryArchiveClient";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  doctorInlineLinkClass,
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout";
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import type { CommunicationsTabProps } from "../communicationsTabRegistry";

/** Таб «Рассылки». ?archive=1 → архив ошибок доставки. */
export function BroadcastsTab({ deepLinkParams, onDeepLinkChange }: CommunicationsTabProps) {
  if (deepLinkParams.archive === "1") {
    return (
      <div className="flex flex-col gap-4">
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
  /** Мобильный вид: "list" = форма, "detail" = журнал. На desktop обе панели видны. */
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  /** Префилл формы из журнала: entry + монотонный nonce. */
  const [prefill, setPrefill] = useState<BroadcastFormPrefill | undefined>(undefined);
  const prefillNonceRef = useRef(0);

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

  const leftPane = (
    <section className={cn(doctorSectionCardClass, "h-full overflow-y-auto")}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className={doctorSectionTitleClass}>Новая рассылка</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMobileView("detail")}
          className="lg:hidden"
        >
          Журнал →
        </Button>
      </div>
      <BroadcastForm onBroadcastSent={() => void refreshLog()} prefill={prefill} />
    </section>
  );

  const rightPane = (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      <p className="text-sm text-muted-foreground">
        После отправки сообщения ставятся в очередь; счётчики в журнале обновляются по мере
        работы воркера.{" "}
        <button type="button" onClick={onArchive} className={doctorInlineLinkClass}>
          Архив ошибок доставки
        </button>
      </p>
      <section className={doctorSectionCardClass}>
        <h2 className={cn(doctorSectionTitleClass, "mb-1")}>Журнал рассылок</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <BroadcastAuditLog
            entries={entries}
            onArchive={onArchive}
            onCreateFrom={(entry) => {
              prefillNonceRef.current += 1;
              setPrefill({ entry, nonce: prefillNonceRef.current });
              setMobileView("list");
            }}
          />
        )}
      </section>
    </div>
  );

  return (
    <div
      id="broadcasts-main-view"
      className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}
    >
      <CatalogSplitLayout
        left={leftPane}
        right={rightPane}
        mobileView={mobileView}
        mobileBackSlot={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileView("list")}
            className="mb-2"
          >
            ← Форма
          </Button>
        }
        className="lg:grid-cols-[1fr_1.2fr] h-full"
      />
    </div>
  );
}
