'use client';

import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/doctor/primitives/card';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Textarea } from '@/shared/ui/doctor/primitives/textarea';
import { apiJson } from '@/shared/lib/apiJson';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import type {
  NotifTemplateAudience,
  NotifTemplateEvent,
} from '@/modules/notif-templates/notifTemplatesService';
import {
  NOTIF_TEMPLATE_CHANNELS,
  allowedNotifTemplateVariables,
  type ManagedNotifPresentation,
  type ManagedNotifPresentationEntry,
  type ManagedNotifTemplateChannels,
  type ManagedNotifTemplateEntry,
  type NotifTemplateChannel,
  type RenderedManagedNotifTemplate,
} from '@/modules/notif-templates/managedNotifTemplate';
import { notifTemplateTitle, NOTIF_VARIABLE_LABELS } from './notifTemplateLabels';

type Props = Readonly<{
  endpoint: '/api/doctor/notification-templates' | '/api/admin/notification-templates';
  templates: ManagedNotifTemplateEntry[];
  presentation: ManagedNotifPresentationEntry;
  brandingMutationAvailable: boolean;
}>;

const TEMPLATE_AUDIENCE_GROUPS: Array<{ audience: NotifTemplateAudience; title: string }> = [
  { audience: 'patient', title: 'Уведомления клиенту' },
  { audience: 'doctor', title: 'Уведомления специалисту' },
];

const CHANNEL_LABELS: Record<NotifTemplateChannel, string> = {
  email: 'Email',
  telegram: 'Telegram',
  max: 'MAX',
  smsc: 'SMS',
  web_push: 'Push',
};

function templateKey(event: NotifTemplateEvent, audience: NotifTemplateAudience): string {
  return `${event}:${audience}`;
}

function contentFieldKey(key: string, channel: NotifTemplateChannel, field: string): string {
  return `${key}:${channel}:${field}`;
}

function cloneChannels(channels: ManagedNotifTemplateChannels): ManagedNotifTemplateChannels {
  return {
    email: { ...channels.email },
    telegram: { ...channels.telegram },
    max: { ...channels.max },
    smsc: { ...channels.smsc },
    web_push: { ...channels.web_push },
  };
}

export function NotificationTemplatesPageClient({
  endpoint,
  templates,
  presentation,
  brandingMutationAvailable,
}: Props) {
  const initialChannels = useMemo(() => {
    const map: Record<string, ManagedNotifTemplateChannels> = {};
    for (const entry of templates)
      map[templateKey(entry.event, entry.audience)] = cloneChannels(entry.managed.channels);
    return map;
  }, [templates]);
  const [values, setValues] =
    useState<Record<string, ManagedNotifTemplateChannels>>(initialChannels);
  const [templateEntries, setTemplateEntries] = useState<ManagedNotifTemplateEntry[]>(templates);
  const [selectedChannel, setSelectedChannel] = useState<NotifTemplateChannel>('email');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [previewByKey, setPreviewByKey] = useState<
    Record<string, RenderedManagedNotifTemplate | undefined>
  >({});
  const [presentationValue, setPresentationValue] = useState<ManagedNotifPresentation>(
    presentation.presentation,
  );
  const [presentationEntry, setPresentationEntry] =
    useState<ManagedNotifPresentationEntry>(presentation);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  function updateChannels(
    key: string,
    update: (current: ManagedNotifTemplateChannels) => ManagedNotifTemplateChannels,
  ) {
    setValues((previous) => ({ ...previous, [key]: update(previous[key]!) }));
  }

  function setTextField(
    key: string,
    channel: NotifTemplateChannel,
    field: 'subject' | 'plainText' | 'title' | 'text',
    value: string,
  ) {
    updateChannels(key, (current) => {
      if (channel === 'email') {
        return { ...current, email: { ...current.email, [field]: value } };
      }
      if (channel === 'web_push') {
        return { ...current, web_push: { ...current.web_push, [field]: value } };
      }
      return { ...current, [channel]: { text: value } };
    });
  }

  function currentFieldValue(
    channels: ManagedNotifTemplateChannels,
    channel: NotifTemplateChannel,
    field: 'subject' | 'plainText' | 'title' | 'text',
  ): string {
    if (channel === 'email')
      return field === 'subject' ? channels.email.subject : channels.email.plainText;
    if (channel === 'web_push')
      return field === 'title' ? channels.web_push.title : channels.web_push.text;
    return channels[channel].text;
  }

  function insertVariable(
    key: string,
    channel: NotifTemplateChannel,
    field: 'subject' | 'plainText' | 'title' | 'text',
    variable: string,
  ) {
    const refKey = contentFieldKey(key, channel, field);
    const element = textareaRefs.current[refKey];
    const token = `{{${variable}}}`;
    const channels = values[key]!;
    const current = currentFieldValue(channels, channel, field);
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? start;
    setTextField(key, channel, field, current.slice(0, start) + token + current.slice(end));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function saveTemplate(entry: ManagedNotifTemplateEntry) {
    const key = templateKey(entry.event, entry.audience);
    setSavingKey(key);
    try {
      const response = await apiJson<{ ok?: boolean; template: ManagedNotifTemplateEntry }>(
        endpoint,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'template',
            event: entry.event,
            audience: entry.audience,
            channels: values[key],
            expectedUpdatedAt: entry.metadata.writeToken,
          }),
        },
      );
      setTemplateEntries((current) =>
        current.map((candidate) =>
          candidate.event === entry.event && candidate.audience === entry.audience
            ? response.template
            : candidate,
        ),
      );
      setValues((current) => ({
        ...current,
        [key]: cloneChannels(response.template.managed.channels),
      }));
      if (entry.event === 'created' && entry.audience === 'patient') {
        setPresentationEntry((current) => ({
          ...current,
          metadata: { ...current.metadata, writeToken: response.template.metadata.writeToken },
        }));
      }
      toast.success('Шаблон сохранён');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить шаблон');
    } finally {
      setSavingKey(null);
    }
  }

  async function previewTemplate(entry: ManagedNotifTemplateEntry) {
    const key = templateKey(entry.event, entry.audience);
    try {
      const response = await apiJson<{ ok?: boolean; rendered: RenderedManagedNotifTemplate }>(
        endpoint,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            event: entry.event,
            audience: entry.audience,
            channel: selectedChannel,
            channels: values[key],
            presentation: {
              layout: presentationValue.layout,
              signature: presentationValue.signature,
              contacts: presentationValue.contacts,
            },
          }),
        },
      );
      setPreviewByKey((previous) => ({ ...previous, [key]: response.rendered }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось построить предпросмотр');
    }
  }

  async function savePresentation() {
    setSavingKey('presentation');
    try {
      const response = await apiJson<{ ok?: boolean; presentation: ManagedNotifPresentationEntry }>(
        endpoint,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: 'presentation',
            presentation: {
              layout: presentationValue.layout,
              signature: presentationValue.signature,
              contacts: presentationValue.contacts,
            },
            expectedUpdatedAt: presentationEntry.metadata.writeToken,
          }),
        },
      );
      setPresentationEntry(response.presentation);
      setPresentationValue(response.presentation.presentation);
      setTemplateEntries((current) =>
        current.map((entry) =>
          entry.event === 'created' && entry.audience === 'patient'
            ? {
                ...entry,
                metadata: {
                  ...entry.metadata,
                  writeToken: response.presentation.metadata.writeToken,
                },
              }
            : entry,
        ),
      );
      toast.success('Оформление сохранено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось сохранить оформление');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className={doctorSectionCardClass} aria-labelledby="notification-presentation-title">
        <h2 id="notification-presentation-title" className={doctorSectionTitleClass}>
          Оформление email
        </h2>
        <p className="text-sm text-muted-foreground">
          Текст вставляется в безопасный системный макет. Произвольные HTML и CSS не поддерживаются.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Подпись</span>
            <Input
              value={presentationValue.signature}
              onChange={(event) =>
                setPresentationValue((current) => ({ ...current, signature: event.target.value }))
              }
              disabled={!brandingMutationAvailable}
              maxLength={500}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Контакты</span>
            <Input
              value={presentationValue.contacts}
              onChange={(event) =>
                setPresentationValue((current) => ({ ...current, contacts: event.target.value }))
              }
              disabled={!brandingMutationAvailable}
              maxLength={500}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={presentationValue.layout === 'neutral' ? 'default' : 'outline'}
            onClick={() => setPresentationValue((current) => ({ ...current, layout: 'neutral' }))}
            disabled={!brandingMutationAvailable}
          >
            Нейтральное
          </Button>
          <Button
            type="button"
            size="sm"
            variant={presentationValue.layout === 'organization' ? 'default' : 'outline'}
            onClick={() =>
              setPresentationValue((current) => ({ ...current, layout: 'organization' }))
            }
            disabled={!brandingMutationAvailable}
          >
            Брендированное
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void savePresentation()}
            disabled={!brandingMutationAvailable || savingKey === 'presentation'}
          >
            {savingKey === 'presentation' ? 'Сохранение…' : 'Сохранить оформление'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Источник: {presentationEntry.metadata.effectiveSource}, ревизия{' '}
            {presentationEntry.metadata.revision}
          </span>
        </div>
      </section>

      <div className="flex flex-wrap gap-2" aria-label="Канал шаблона">
        {NOTIF_TEMPLATE_CHANNELS.map((channel) => (
          <Button
            key={channel}
            type="button"
            size="sm"
            variant={selectedChannel === channel ? 'default' : 'outline'}
            onClick={() => setSelectedChannel(channel)}
          >
            {CHANNEL_LABELS[channel]}
          </Button>
        ))}
      </div>

      {TEMPLATE_AUDIENCE_GROUPS.map(({ audience, title }) => {
        const groupTemplates = templateEntries.filter((entry) => entry.audience === audience);
        return (
          <section
            key={audience}
            className={doctorSectionCardClass}
            aria-labelledby={`notification-templates-${audience}`}
          >
            <h2 id={`notification-templates-${audience}`} className={doctorSectionTitleClass}>
              {title}
            </h2>
            <div className="grid gap-3 xl:grid-cols-3">
              {groupTemplates.map((entry) => {
                const key = templateKey(entry.event, entry.audience);
                const channels = values[key]!;
                const variables = allowedNotifTemplateVariables(
                  entry.event,
                  entry.audience,
                  selectedChannel,
                );
                const preview = previewByKey[key];
                const fields: Array<{
                  field: 'subject' | 'plainText' | 'title' | 'text';
                  label: string;
                  rows: number;
                }> =
                  selectedChannel === 'email'
                    ? [
                        { field: 'subject', label: 'Тема письма', rows: 1 },
                        { field: 'plainText', label: 'Текст письма', rows: 5 },
                      ]
                    : selectedChannel === 'web_push'
                      ? [
                          { field: 'title', label: 'Заголовок', rows: 1 },
                          { field: 'text', label: 'Текст', rows: 4 },
                        ]
                      : [{ field: 'text', label: 'Текст', rows: 5 }];
                return (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle className="text-sm">
                        {notifTemplateTitle(entry.event, entry.audience)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {entry.legacyCompatibility.status === 'incompatible' ? (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                          <div className="font-medium">
                            Старый шаблон сохранён, но содержит несовместимые поля
                          </div>
                          <div className="mt-1 whitespace-pre-wrap">
                            {entry.legacyCompatibility.preservedText}
                          </div>
                          <div className="mt-1">
                            Нужно вручную перенести смысл в безопасные поля. Несовместимые элементы:{' '}
                            {entry.legacyCompatibility.forbiddenVariables.join(', ') ||
                              'неподдерживаемый формат'}
                            .
                          </div>
                        </div>
                      ) : null}
                      {fields.map(({ field, label, rows }) => {
                        const refKey = contentFieldKey(key, selectedChannel, field);
                        return (
                          <label key={field} className="block space-y-1 text-xs">
                            <span>{label}</span>
                            <Textarea
                              ref={(element) => {
                                textareaRefs.current[refKey] = element;
                              }}
                              value={currentFieldValue(channels, selectedChannel, field)}
                              onChange={(event) =>
                                setTextField(key, selectedChannel, field, event.target.value)
                              }
                              disabled={!brandingMutationAvailable}
                              rows={rows}
                              aria-label={`${notifTemplateTitle(entry.event, entry.audience)} — ${label}`}
                            />
                            <span className="flex flex-wrap gap-1.5">
                              {variables.map((variable) => (
                                <Button
                                  key={variable}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    insertVariable(key, selectedChannel, field, variable)
                                  }
                                  title={`{{${variable}}}`}
                                  className="rounded-md border border-border/60 bg-muted px-2 py-1 text-xs text-muted-foreground"
                                  disabled={!brandingMutationAvailable}
                                >
                                  {NOTIF_VARIABLE_LABELS[variable] ?? variable}
                                </Button>
                              ))}
                            </span>
                          </label>
                        );
                      })}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {entry.metadata.effectiveSource}, ревизия {entry.metadata.revision}
                        </span>
                        <span className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => void previewTemplate(entry)}
                          >
                            Предпросмотр
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void saveTemplate(entry)}
                            disabled={!brandingMutationAvailable || savingKey === key}
                          >
                            {savingKey === key ? 'Сохранение…' : 'Сохранить'}
                          </Button>
                        </span>
                      </div>
                      {preview ? (
                        <div
                          className="rounded-lg border bg-background p-3 text-sm"
                          aria-label="Синтетический предпросмотр"
                        >
                          {preview.channel === 'email' ? (
                            <>
                              <div className="mb-2 font-medium">{preview.subject}</div>
                              <iframe
                                title="Предпросмотр email"
                                sandbox=""
                                srcDoc={preview.html}
                                className="h-48 w-full rounded border bg-white"
                              />
                            </>
                          ) : preview.channel === 'web_push' ? (
                            <>
                              <div className="font-medium">{preview.title}</div>
                              <div>{preview.text}</div>
                            </>
                          ) : (
                            <div className="whitespace-pre-wrap">{preview.text}</div>
                          )}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
