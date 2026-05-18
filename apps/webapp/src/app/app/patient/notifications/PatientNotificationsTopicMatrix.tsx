"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import type { ProfileNotificationTopicModel } from "@/modules/patient-notifications/profileTopicChannelsModel";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import {
  setNotificationTopicMasterEnabled,
  setTopicChannelNotificationEnabled,
} from "./notificationPrefsActions";

const CHANNEL_ORDER = ["web_push", "telegram", "max", "email"] as const;

export function PatientNotificationsTopicMatrix({ initialTopics }: { initialTopics: ProfileNotificationTopicModel[] }) {
  const [topics, setTopics] = useState(initialTopics);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setTopics(initialTopics);
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

  const onMasterToggle = useCallback((topicId: string, next: boolean) => {
    startTransition(async () => {
      const res = await setNotificationTopicMasterEnabled(topicId, next);
      if (res.ok) {
        setTopics((prev) =>
          prev.map((t) => (t.topicId !== topicId ? t : { ...t, topicMasterEnabled: next })),
        );
      }
    });
  }, []);

  const onChannelToggle = useCallback((topicId: string, channelCode: string, next: boolean) => {
    startTransition(async () => {
      const res = await setTopicChannelNotificationEnabled(topicId, channelCode, next);
      if (res.ok) {
        setTopics((prev) =>
          prev.map((t) =>
            t.topicId !== topicId ?
              t
            : {
                ...t,
                channels: t.channels.map((c) => (c.code === channelCode ? { ...c, isEnabled: next } : c)),
              },
          ),
        );
      }
    });
  }, []);

  if (topics.length === 0) {
    return <p className={patientMutedTextClass}>Нет доступных типов уведомлений.</p>;
  }

  if (channelLabels.length === 0) {
    return <p className={patientMutedTextClass}>Подключите канал доставки выше, чтобы настроить типы уведомлений.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--patient-border)]/60">
            <th className="py-2 pr-3 text-left font-medium text-[var(--patient-text-primary)]">Тип</th>
            {channelLabels.map((ch) => (
              <th key={ch.code} className="px-2 py-2 text-center font-normal text-muted-foreground">
                {ch.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => {
            const channelsDisabled = !t.topicMasterEnabled;
            return (
              <tr key={t.topicId} className="border-b border-[var(--patient-border)]/40">
                <td className="py-3 pr-3 align-middle">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={t.topicMasterEnabled}
                      disabled={pending}
                      onCheckedChange={(v) => onMasterToggle(t.topicId, v)}
                      aria-label={`${t.displayTitle}: тема`}
                    />
                    <span className="text-[var(--patient-text-primary)]">{t.displayTitle}</span>
                  </div>
                </td>
                {channelLabels.map((ch) => {
                  const cell = t.channels.find((c) => c.code === ch.code);
                  if (!cell) {
                    return (
                      <td key={ch.code} className="px-2 py-3 text-center align-middle text-muted-foreground">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={ch.code} className="px-2 py-3 text-center align-middle">
                      <Switch
                        checked={cell.isEnabled}
                        disabled={pending || channelsDisabled}
                        onCheckedChange={(v) => onChannelToggle(t.topicId, ch.code, v)}
                        aria-label={`${t.displayTitle}: ${ch.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
