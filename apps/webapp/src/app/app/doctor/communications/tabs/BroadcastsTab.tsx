'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BroadcastAuditEntry } from '@/modules/doctor-broadcasts/ports';
import { listBroadcastAuditAction } from '../../broadcasts/actions';
import { BroadcastForm, type BroadcastFormPrefill } from '../../broadcasts/BroadcastForm';
import { BroadcastAuditEntryDetail, BroadcastAuditLog } from '../../broadcasts/BroadcastAuditLog';
import { BroadcastDeliveryArchiveClient } from '../../broadcasts/BroadcastDeliveryArchiveClient';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import type { CommunicationsTabProps } from '../communicationsTabRegistry';

/** Таб «Рассылки». ?archive=1 → лог ошибок в правой панели. */
export function BroadcastsTab({
  deepLinkParams,
  onDeepLinkChange,
  mailingsMutationAvailable = true,
}: CommunicationsTabProps) {
  return (
    <BroadcastsMainView
      errorLogOpen={deepLinkParams.archive === '1'}
      onOpenErrorLog={() => onDeepLinkChange('archive', '1')}
      onCloseErrorLog={() => onDeepLinkChange('archive', null)}
      mailingsMutationAvailable={mailingsMutationAvailable}
    />
  );
}

type BroadcastsMainViewProps = {
  errorLogOpen: boolean;
  onOpenErrorLog: () => void;
  onCloseErrorLog: () => void;
  mailingsMutationAvailable: boolean;
};

function BroadcastsMainView({
  errorLogOpen,
  onOpenErrorLog,
  onCloseErrorLog,
  mailingsMutationAvailable,
}: BroadcastsMainViewProps) {
  const [entries, setEntries] = useState<BroadcastAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  /** Мобильный вид: "list" = форма, "detail" = журнал. На desktop обе панели видны. */
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  /** Префилл формы из журнала: entry + монотонный nonce. */
  const [prefill, setPrefill] = useState<BroadcastFormPrefill | undefined>(undefined);
  const [selectedEntry, setSelectedEntry] = useState<BroadcastAuditEntry | null>(null);
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

  const createFromEntry = useCallback((entry: BroadcastAuditEntry) => {
    prefillNonceRef.current += 1;
    setPrefill({ entry, nonce: prefillNonceRef.current });
    setSelectedEntry(null);
    setMobileView('list');
  }, []);

  const formPane = (
    <section className={cn(doctorSectionCardClass, 'h-full overflow-y-auto')}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className={doctorSectionTitleClass}>Новая рассылка</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMobileView('detail')}
          className="lg:hidden"
        >
          Журнал →
        </Button>
      </div>
      <BroadcastForm onBroadcastSent={() => void refreshLog()} prefill={prefill} />
    </section>
  );

  const leftPane = selectedEntry ? (
    <BroadcastAuditEntryDetail
      entry={selectedEntry}
      onClose={() => setSelectedEntry(null)}
      onOpenErrors={() => {
        onOpenErrorLog();
        setMobileView('detail');
      }}
      onCreateFrom={mailingsMutationAvailable ? createFromEntry : undefined}
    />
  ) : (
    formPane
  );

  const rightPane = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section
        className={cn(doctorSectionCardClass, 'flex min-h-0 flex-1 flex-col overflow-hidden')}
      >
        <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
          <h2 className={doctorSectionTitleClass}>
            {errorLogOpen ? 'Лог ошибок' : 'Журнал рассылок'}
          </h2>
          {errorLogOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                onCloseErrorLog();
                setMobileView('list');
              }}
              aria-label="Закрыть лог ошибок"
              className="hidden shrink-0 lg:inline-flex"
            >
              <X aria-hidden className="size-4" />
            </Button>
          ) : null}
        </div>
        {errorLogOpen ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BroadcastDeliveryArchiveClient />
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BroadcastAuditLog
              entries={entries}
              selectedId={selectedEntry?.id}
              onSelect={(entry) => {
                setSelectedEntry(entry);
                setMobileView('list');
              }}
            />
          </div>
        )}
      </section>
    </div>
  );

  if (!mailingsMutationAvailable) {
    return (
      <div id="broadcasts-main-view" className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}>
        {rightPane}
      </div>
    );
  }

  return (
    <div id="broadcasts-main-view" className={DOCTOR_CATALOG_SPLIT_LAYOUT_MAX_H_SINGLE}>
      <CatalogSplitLayout
        left={leftPane}
        right={rightPane}
        mobileView={errorLogOpen ? 'detail' : mobileView}
        desktopColsClassName="lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)]"
        mobileBackSlot={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (errorLogOpen) onCloseErrorLog();
              setMobileView('list');
            }}
            className="mb-2 h-9 px-2"
          >
            {selectedEntry ? '← Рассылка' : '← Форма'}
          </Button>
        }
        className="h-full"
      />
    </div>
  );
}
