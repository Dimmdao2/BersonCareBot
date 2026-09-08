'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Switch } from '@/shared/ui/patient/primitives/switch';
import { cn } from '@/lib/utils';
import type { ProfileNotificationTopicModel } from '@/modules/patient-notifications/profileTopicChannelsModel';
import { patientBodyTextClass, patientCaptionTextClass, patientMutedTextClass } from '@/shared/ui/patient/patientVisual';
import { setTopicChannelNotificationEnabled } from './notificationPrefsActions';

const CHANNEL_ORDER = ['web_push', 'telegram', 'max', 'email'] as const;

const TOPIC_TITLE_CELL_CLASS =
  `${patientBodyTextClass} max-w-[9rem] whitespace-normal break-words sm:max-w-[10rem]`;
const CHANNEL_HEADER_CLASS =
  `${patientCaptionTextClass} max-w-[3.25rem] px-2 py-2 text-center whitespace-normal`;

type Props = {
  initialTopics: ProfileNotificationTopicModel[];
  pushEffective: boolean;
};

function cellKey(topicId: string, channelCode: string): string {
  return `${topicId}:${channelCode}`;
}

function enabledByCell(topics: ProfileNotificationTopicModel[]): Map<string, boolean> {
  return new Map(
    topics.flatMap((topic) =>
      topic.channels.map((channel) => [
        cellKey(topic.topicId, channel.code),
        channel.isEnabled,
      ]),
    ),
  );
}

export function PatientNotificationsTopicMatrix({ initialTopics, pushEffective }: Props) {
  const [topics, setTopics] = useState(initialTopics);
  const persistedByCellRef = useRef(enabledByCell(initialTopics));
  const desiredByCellRef = useRef(enabledByCell(initialTopics));
  const savingCellsRef = useRef(new Set<string>());

  useEffect(() => {
    if (savingCellsRef.current.size > 0) return;
    setTopics(initialTopics);
    persistedByCellRef.current = enabledByCell(initialTopics);
    desiredByCellRef.current = enabledByCell(initialTopics);
  }, [initialTopics]);

  const channelLabels = (() => {
    const labels = new Map<string, string>();
    for (const t of topics) {
      for (const c of t.channels) {
        labels.set(c.code, c.label);
      }
    }
    return CHANNEL_ORDER.filter((code) => labels.has(code)).map((code) => ({
      code,
      label: labels.get(code) ?? code,
    }));
  })();

  const setCellEnabled = useCallback((topicId: string, channelCode: string, enabled: boolean) => {
    setTopics((prev) =>
      prev.map((topic) =>
        topic.topicId !== topicId
          ? topic
          : {
              ...topic,
              channels: topic.channels.map((channel) =>
                channel.code === channelCode ? { ...channel, isEnabled: enabled } : channel,
              ),
            },
      ),
    );
  }, []);

  const saveLatestCellValue = useCallback(
    async (topicId: string, channelCode: string, key: string) => {
      if (savingCellsRef.current.has(key)) return;
      savingCellsRef.current.add(key);
      try {
        while (desiredByCellRef.current.get(key) !== persistedByCellRef.current.get(key)) {
          const target = desiredByCellRef.current.get(key);
          if (target === undefined) return;

          const result = await setTopicChannelNotificationEnabled(topicId, channelCode, target);
          if (!result.ok) {
            if (desiredByCellRef.current.get(key) === target) {
              const persisted = persistedByCellRef.current.get(key);
              if (persisted !== undefined) {
                desiredByCellRef.current.set(key, persisted);
                setCellEnabled(topicId, channelCode, persisted);
              }
            }
            toast.error(result.message);
            return;
          }
          persistedByCellRef.current.set(key, target);
        }
      } finally {
        savingCellsRef.current.delete(key);
      }
    },
    [setCellEnabled],
  );

  const onChannelToggle = useCallback(
    (topicId: string, channelCode: string, next: boolean) => {
      const key = cellKey(topicId, channelCode);
      desiredByCellRef.current.set(key, next);
      setCellEnabled(topicId, channelCode, next);
      void saveLatestCellValue(topicId, channelCode, key);
    },
    [saveLatestCellValue, setCellEnabled],
  );

  if (topics.length === 0) {
    return <p className={patientMutedTextClass}>Нет доступных типов уведомлений.</p>;
  }

  if (channelLabels.length === 0) {
    return (
      <p className={patientMutedTextClass}>
        Подключите канал доставки выше, чтобы настроить типы уведомлений.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={cn(patientBodyTextClass, 'w-full min-w-[320px] border-collapse')}>
        <thead>
          <tr className="border-b border-[var(--patient-border)]/60">
            <th
              className={`py-2 pr-3 text-left ${TOPIC_TITLE_CELL_CLASS}`}
            >
              Тип
            </th>
            {channelLabels.map((ch) => (
              <th key={ch.code} className={CHANNEL_HEADER_CLASS}>
                {ch.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <tr key={t.topicId} className="border-b border-[var(--patient-border)]/40">
              <td
                className={`max-w-[9rem] py-3 pr-3 align-top sm:max-w-[10rem] ${TOPIC_TITLE_CELL_CLASS}`}
              >
                {t.displayTitle}
              </td>
              {channelLabels.map((ch) => {
                const cell = t.channels.find((c) => c.code === ch.code);
                if (!cell) {
                  return (
                    <td
                      key={ch.code}
                      className="px-2 py-3 text-center align-middle patient-text-secondary"
                    >
                      —
                    </td>
                  );
                }
                const channelLocked =
                  cell.isEditable === false || (ch.code === 'web_push' && !pushEffective);
                return (
                  <td key={ch.code} className="px-2 py-3 text-center align-middle">
                    <Switch
                      checked={channelLocked && ch.code === 'web_push' ? false : cell.isEnabled}
                      disabled={channelLocked}
                      onCheckedChange={(v) => onChannelToggle(t.topicId, ch.code, v)}
                      aria-label={`${t.displayTitle}: ${ch.label}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
