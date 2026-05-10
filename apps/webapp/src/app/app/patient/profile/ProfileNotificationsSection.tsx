"use client";

import { useCallback, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ProfileNotificationTopicModel } from "@/modules/patient-notifications/profileTopicChannelsModel";
import { patientCardClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import { setTopicChannelNotificationEnabled } from "./notificationPrefsActions";

export function ProfileNotificationsSection({ initialTopics }: { initialTopics: ProfileNotificationTopicModel[] }) {
  const [topics, setTopics] = useState(initialTopics);
  const [pending, startTransition] = useTransition();

  const onToggle = useCallback((topicId: string, channelCode: string, next: boolean) => {
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

  return (
    <Collapsible
      id="patient-profile-notifications"
      defaultOpen={false}
      className={cn(patientCardClass, "!p-0 overflow-hidden")}
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-4 md:p-[18px] text-left">
        <span className={patientSectionTitleClass}>Настройки уведомлений</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--patient-text-muted)] transition-transform duration-200",
            "group-data-[panel-open]:rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 border-t border-[var(--patient-border)]/50 bg-[var(--patient-card-bg)] px-4 pb-4 pt-4 md:px-[18px] md:pb-[18px]">
        {topics.map((t) => (
          <div key={t.topicId} className="flex flex-col gap-2">
            <p className="text-sm text-[var(--patient-text-primary)]">{t.displayTitle}</p>
            {t.channels.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет доступных каналов для этой темы.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {t.channels.map((c) => (
                  <div key={`${t.topicId}-${c.code}`} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                    <Switch
                      checked={c.isEnabled}
                      disabled={pending}
                      onCheckedChange={(v) => onToggle(t.topicId, c.code, v)}
                      aria-label={`${t.displayTitle}: ${c.label}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
