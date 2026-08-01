'use client';

import { useCallback, useEffect, useState } from 'react';
import { DoctorSection, DoctorSectionHeader, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { Button } from '@/shared/ui/doctor/primitives/button';
import type { AccessLifecyclePolicy } from '@/modules/org-entitlements/types';
import { apiJson } from '@/shared/lib/apiJson';

type PolicyChange = {
  mechanic: string | null;
  label: string;
  before: AccessLifecyclePolicy | null;
  after: AccessLifecyclePolicy | null;
};

type HistoryItem = {
  id: string;
  tariffId: string | null;
  tariffName: string | null;
  action: string;
  actorLabel: string;
  reason: string;
  createdAt: string;
  changes: PolicyChange[];
};

type ApiOk = { ok: true; items: HistoryItem[]; total: number; page: number; limit: number };

/**
 * §5a item 2.11 — «Показать журнал там, где политика правится, — рядом с конструктором». Reads
 * `admin_audit_log` rows the constructor's own save path already writes (`saas_tariff_*`), narrowed
 * to the two ladder subjects by `diffTariffPolicySnapshots` server-side. Read-only: there is nothing
 * here to edit, only to explain a clinic's block.
 */
function policyLine(policy: AccessLifecyclePolicy | null): string {
  if (!policy) return '—';
  const terminal = policy.terminalState === 'disabled' ? 'блокировка' : 'только чтение';
  return `терпение ${policy.graceDays} дн. · только чтение ${policy.readOnlyDays} дн. · затем: ${terminal}`;
}

export function TariffPolicyHistoryPanel() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await apiJson<ApiOk>('/api/admin/commercial/tariff-policy-history?limit=50', {
        credentials: 'include',
      });
      setItems(json.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'network');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DoctorSection>
      <DoctorSectionHeader>
        <DoctorSectionTitle>Журнал правок политики лестницы</DoctorSectionTitle>
        <p className="text-sm text-muted-foreground">
          Кто, когда и что поменял в кабинетной политике и политике каждой механики — по этой записи
          можно объяснить клинике, почему она получила блок.
        </p>
      </DoctorSectionHeader>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          Не удалось загрузить журнал ({error}).
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!loading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Правок политики пока не было.</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => {
            const expanded = openId === item.id;
            return (
              <li key={item.id} className="rounded-md border border-border/60 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{item.tariffName ?? item.tariffId ?? '—'}</span>{' '}
                    <span className="text-muted-foreground">
                      · {item.actorLabel} · {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpenId(expanded ? null : item.id)}
                  >
                    {expanded ? 'Скрыть' : `Изменений: ${item.changes.length}`}
                  </Button>
                </div>
                {expanded && (
                  <ul className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
                    {item.changes.map((change, i) => (
                      <li key={`${change.mechanic ?? 'cabinet'}-${i}`}>
                        <span className="font-medium">{change.label}</span>
                        <div className="text-xs text-muted-foreground">
                          было: {policyLine(change.before)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          стало: {policyLine(change.after)}
                        </div>
                      </li>
                    ))}
                    {item.reason && (
                      <li className="text-xs text-muted-foreground">Причина: {item.reason}</li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DoctorSection>
  );
}
