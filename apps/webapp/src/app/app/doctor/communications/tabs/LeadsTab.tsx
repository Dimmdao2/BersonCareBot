'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Archive, Check, Copy, Mail, Phone, RotateCcw, X } from 'lucide-react';
import type { Lead, LeadStatus } from '@/modules/leads/types';
import { cn } from '@/lib/utils';
import { phoneToTelHref } from '@/shared/lib/phoneLinks';
import { notificationText } from '@/shared/notifications/notificationText';
import { DoctorEmptyState } from '@/shared/ui/doctor/DoctorEmptyState';
import {
  DoctorDnaFlatList,
  doctorDnaFlatListClickableClass,
  doctorDnaFlatListMetaClass,
  doctorDnaFlatListPrimaryClass,
  doctorDnaFlatListRowClass,
  DoctorDnaFlatListSelectionStrip,
} from '@/shared/ui/doctor/DoctorDnaFlatListRow';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { CatalogSplitLayout } from '@/shared/ui/doctor/catalog/CatalogSplitLayout';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS } from '@/shared/ui/doctor/doctorWorkspaceLayout';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/doctor/primitives/select';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { notifyDoctorLeadsChanged } from '@/shared/ui/doctor/shell/doctorShellBadgeEvents';
import type { CommunicationsTabProps } from '../communicationsTabRegistry';

type LeadListResponse = { ok: true; leads: Lead[] };
type LeadMutationResponse = { ok: boolean; lead?: Lead; error?: string };
type LeadFilter = 'all' | LeadStatus;
type LeadAction = 'accept' | 'close' | 'reject' | 'archive' | 'unarchive';
type LeadAccountGroup = {
  platformUserId: string;
  contact: Lead;
  applications: Lead[];
};

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'Новая заявка',
  rejected: 'Отклонённая заявка',
  accepted_in_progress: 'Принятая заявка в работе',
  accepted_closed: 'Принятая заявка закрыта',
};

function leadName(lead: Lead): string {
  return (
    [lead.submittedLastName, lead.submittedFirstName, lead.submittedPatronymic]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ') || lead.submittedEmail
  );
}

function leadContact(lead: Lead): string {
  return [lead.submittedEmail, lead.submittedPhone].filter(Boolean).join(' · ');
}

function groupLeadsByAccount(leads: readonly Lead[]): LeadAccountGroup[] {
  const groups = new Map<string, LeadAccountGroup>();
  for (const lead of leads) {
    const group = groups.get(lead.platformUserId);
    if (group) {
      group.applications.push(lead);
    } else {
      groups.set(lead.platformUserId, {
        platformUserId: lead.platformUserId,
        contact: lead,
        applications: [lead],
      });
    }
  }
  return [...groups.values()];
}

function formatLeadDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isLeadListResponse(value: unknown): value is LeadListResponse {
  return (
    value !== null &&
    typeof value === 'object' &&
    'ok' in value &&
    value.ok === true &&
    'leads' in value &&
    Array.isArray(value.leads)
  );
}

async function copyContact(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(notificationText.leadContactCopied);
  } catch {
    toast.error(notificationText.leadContactCopyFailed);
  }
}

function LeadContactActions({ lead }: { lead: Lead }) {
  const phoneHref = phoneToTelHref(lead.submittedPhone);
  return (
    <div className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={!lead.submittedEmail}>
              <Mail className="size-4" aria-hidden />
              Почта
            </Button>
          }
        />
        {lead.submittedEmail ? (
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => window.open(`mailto:${lead.submittedEmail}`, '_self')}>
              <Mail />
              Написать
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void copyContact(lead.submittedEmail)}>
              <Copy />
              Скопировать
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" size="sm" disabled={!lead.submittedPhone}>
              <Phone className="size-4" aria-hidden />
              Телефон
            </Button>
          }
        />
        {lead.submittedPhone ? (
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => void copyContact(lead.submittedPhone!)}>
              <Copy />
              Скопировать
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => phoneHref && window.open(phoneHref, '_self')}>
              <Phone />
              Позвонить
            </DropdownMenuItem>
          </DropdownMenuContent>
        ) : null}
      </DropdownMenu>
    </div>
  );
}

function LeadDetail({
  lead,
  busy,
  onAction,
}: {
  lead: Lead;
  busy: LeadAction | null;
  onAction: (action: LeadAction, comment?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionComment, setRejectionComment] = useState('');
  const isBusy = busy !== null;
  const canAcceptOrReject = lead.status === 'new';

  return (
    <section
      className={cn(doctorSectionCardClass, 'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto')}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className={doctorSectionTitleClass}>{leadName(lead)}</h2>
          <p className={doctorDnaFlatListMetaClass}>{LEAD_STATUS_LABEL[lead.status]}</p>
        </div>
        <p className={cn(doctorDnaFlatListMetaClass, 'shrink-0')}>
          {formatLeadDate(lead.createdAt)}
        </p>
      </div>

      <div className="grid gap-1 text-sm">
        <p className={doctorDnaFlatListMetaClass}>Как связаться</p>
        <p>{lead.preferredContact?.trim() || leadContact(lead) || 'Контакт не указан'}</p>
        <LeadContactActions lead={lead} />
      </div>

      <div className="grid gap-1 text-sm">
        <p className={doctorDnaFlatListMetaClass}>Текст заявки</p>
        <p className="whitespace-pre-wrap break-words">{lead.messageText}</p>
      </div>

      {lead.rejectionComment ? (
        <div className="grid gap-1 text-sm">
          <p className={doctorDnaFlatListMetaClass}>Комментарий к отклонению</p>
          <p className="whitespace-pre-wrap break-words">{lead.rejectionComment}</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {canAcceptOrReject ? (
          <Button type="button" size="sm" disabled={isBusy} onClick={() => onAction('accept')}>
            <Check className="size-4" aria-hidden />
            Принять
          </Button>
        ) : null}
        {lead.status === 'accepted_in_progress' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => onAction('close')}
          >
            <Check className="size-4" aria-hidden />
            Закрыть
          </Button>
        ) : null}
        {canAcceptOrReject && !rejecting ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => setRejecting(true)}
          >
            <X className="size-4" aria-hidden />
            Отклонить
          </Button>
        ) : null}
        {lead.archivedAt ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => onAction('unarchive')}
          >
            <RotateCcw className="size-4" aria-hidden />
            Из архива
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={() => onAction('archive')}
          >
            <Archive className="size-4" aria-hidden />В архив
          </Button>
        )}
      </div>

      {canAcceptOrReject && rejecting ? (
        <div className="grid gap-2 border-t border-border/60 pt-3">
          <Textarea
            value={rejectionComment}
            onChange={(event) => setRejectionComment(event.target.value)}
            placeholder="Комментарий (необязательно)"
            maxLength={4_000}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isBusy}
              onClick={() => onAction('reject', rejectionComment)}
            >
              Подтвердить отклонение
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => setRejecting(false)}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Tab «Заявки»: list and detail are deliberately fed only by the guarded leads API doors. */
export function LeadsTab({ deepLinkParams, onDeepLinkChange }: CommunicationsTabProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');
  const [busy, setBusy] = useState<LeadAction | null>(null);
  const archived = deepLinkParams.archived === 'true';

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/doctor/leads${archived ? '?archived=true' : ''}`, {
        cache: 'no-store',
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isLeadListResponse(payload)) {
        toast.error(notificationText.leadListLoadFailed);
        return;
      }
      setLeads(payload.leads);
      setSelectedId((current) =>
        payload.leads.some((lead) => lead.id === current)
          ? current
          : (payload.leads[0]?.id ?? null),
      );
    } catch {
      toast.error(notificationText.leadListLoadFailed);
    } finally {
      setLoading(false);
    }
  }, [archived]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const filteredLeads = useMemo(
    () => (filter === 'all' ? leads : leads.filter((lead) => lead.status === filter)),
    [filter, leads],
  );
  const leadAccountGroups = useMemo(() => groupLeadsByAccount(filteredLeads), [filteredLeads]);
  const selectedLead = leads.find((lead) => lead.id === selectedId) ?? null;

  const applyAction = useCallback(
    async (action: LeadAction, comment?: string) => {
      if (!selectedLead || busy !== null) return;
      setBusy(action);
      try {
        const response = await fetch(`/api/doctor/leads/${encodeURIComponent(selectedLead.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'reject' ? { action, comment } : { action }),
        });
        const payload = (await response.json()) as LeadMutationResponse;
        if (!response.ok || !payload.ok || !payload.lead) {
          toast.error(
            payload.error === 'lead_status_transition_invalid'
              ? notificationText.leadAlreadyInProgress
              : notificationText.leadChangeFailed,
          );
          return;
        }
        notifyDoctorLeadsChanged();
        if (action === 'archive' || action === 'unarchive') {
          void loadLeads();
          return;
        }
        setLeads((current) =>
          current.map((lead) => (lead.id === payload.lead!.id ? payload.lead! : lead)),
        );
      } catch {
        toast.error(notificationText.leadChangeFailed);
      } finally {
        setBusy(null);
      }
    },
    [busy, loadLeads, selectedLead],
  );

  const listPane = (
    <section className={cn(doctorSectionCardClass, 'flex min-h-0 flex-1 flex-col overflow-hidden')}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-2">
        <h2 className={doctorSectionTitleClass}>{archived ? 'Архив заявок' : 'Заявки'}</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onDeepLinkChange('archived', archived ? null : 'true')}
        >
          {archived ? 'К заявкам' : 'Архив'}
        </Button>
      </div>
      <Select value={filter} onValueChange={(value) => setFilter(value as LeadFilter)}>
        <SelectTrigger
          className="h-8"
          displayLabel={filter === 'all' ? 'Все статусы' : LEAD_STATUS_LABEL[filter]}
        >
          <SelectValue placeholder="Статус" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все статусы</SelectItem>
          {Object.entries(LEAD_STATUS_LABEL).map(([status, label]) => (
            <SelectItem key={status} value={status}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="min-h-0 flex-1 overflow-y-auto pt-2">
        {loading ? (
          <DoctorPanelLoading />
        ) : filteredLeads.length === 0 ? (
          <DoctorEmptyState>Заявок нет</DoctorEmptyState>
        ) : (
          <ul className="m-0 list-none p-0 [&>li+li]:border-t [&>li+li]:border-border/60">
            {leadAccountGroups.map((group) => {
              return (
                <li key={group.platformUserId}>
                  <div className="grid gap-0.5 bg-muted/35 px-[var(--doctor-list-inline-padding,18px)] py-2.5">
                    <span className={doctorDnaFlatListPrimaryClass}>{leadName(group.contact)}</span>
                    <span className={doctorDnaFlatListMetaClass}>{leadContact(group.contact)}</span>
                  </div>
                  <DoctorDnaFlatList
                    aria-label={`Заявки контакта ${leadName(group.contact)}`}
                    className="border-t border-border/60"
                  >
                    {group.applications.map((lead) => {
                      const selected = lead.id === selectedId;
                      return (
                        <li key={lead.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(lead.id);
                              setMobileView('detail');
                            }}
                            className={cn(
                              doctorDnaFlatListRowClass,
                              doctorDnaFlatListClickableClass,
                              'w-full flex-col items-stretch gap-1 text-left',
                              selected && 'bg-primary/15 text-primary',
                            )}
                          >
                            {selected ? <DoctorDnaFlatListSelectionStrip /> : null}
                            <span className={doctorDnaFlatListPrimaryClass}>
                              {LEAD_STATUS_LABEL[lead.status]}
                            </span>
                            <span className={cn(doctorDnaFlatListMetaClass, 'line-clamp-2')}>
                              {lead.messageText}
                            </span>
                            <span className={doctorDnaFlatListMetaClass}>
                              {formatLeadDate(lead.createdAt)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </DoctorDnaFlatList>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );

  const detailPane = selectedLead ? (
    <LeadDetail lead={selectedLead} busy={busy} onAction={applyAction} />
  ) : (
    <section className={cn(doctorSectionCardClass, 'flex min-h-0 flex-1')}>
      <DoctorEmptyState>Выберите заявку</DoctorEmptyState>
    </section>
  );

  return (
    <div className={DOCTOR_REMAINING_HEIGHT_SPLIT_LAYOUT_CLASS}>
      <CatalogSplitLayout
        left={listPane}
        right={detailPane}
        mobileView={mobileView}
        splitFrom="md"
        className="h-full"
        mobileBackSlot={
          <Button type="button" variant="ghost" size="sm" onClick={() => setMobileView('list')}>
            ← Заявки
          </Button>
        }
      />
    </div>
  );
}
