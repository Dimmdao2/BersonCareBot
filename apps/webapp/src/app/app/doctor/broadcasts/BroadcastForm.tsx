"use client";

import { useTransition, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type {
  BroadcastAuditEntry,
  BroadcastAudienceFilter,
  BroadcastCategory,
  BroadcastChannel,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";
import {
  BROADCAST_ACTIVE_CHANNELS,
  BROADCAST_DEFAULT_CHANNELS,
} from "@/modules/doctor-broadcasts/broadcastChannels";
import {
  BROADCAST_FORM_CATEGORIES,
  isAudienceEstimateApproximate,
} from "./labels";
import { BroadcastAudienceSelect } from "./BroadcastAudienceSelect";
import { BroadcastConfirmStep } from "./BroadcastConfirmStep";
import { BroadcastSentMessage } from "./BroadcastSentMessage";
import {
  previewBroadcastAction,
  executeBroadcastAction,
  loadDraftAction,
  saveDraftAction,
  getChannelCountsAction,
} from "./actions";
import { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE } from "@/modules/doctor-broadcasts/deliveryQueueKind";
import type { BroadcastChannelCounts } from "@/modules/doctor-broadcasts/draftPort";

type Stage = "idle" | "previewing" | "previewed" | "confirming" | "sent" | "error";

const CHANNEL_TILE_LABELS: Record<BroadcastChannel, string> = {
  bot_message: "Telegram+MAX", // legacy
  telegram: "Telegram",
  max: "MAX",
  sms: "SMS",
  push: "Push",
  email: "Email",
  home_banner: "Баннер",
  notification_bell: "Bell",
};

type Props = {
  onBroadcastSent?: (entry: BroadcastAuditEntry) => void;
};

export function BroadcastForm({ onBroadcastSent }: Props) {
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<BroadcastPreviewResult | null>(null);
  const [sentEntry, setSentEntry] = useState<BroadcastAuditEntry | null>(null);

  const [category, setCategory] = useState<BroadcastCategory | "">("organizational");
  const [audience, setAudience] = useState<BroadcastAudienceFilter | "">("");
  const [selectedChannels, setSelectedChannels] = useState<Set<BroadcastChannel>>(
    new Set(BROADCAST_DEFAULT_CHANNELS),
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [channelCounts, setChannelCounts] = useState<BroadcastChannelCounts | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Load draft and channel counts on mount
  useEffect(() => {
    void (async () => {
      const [draft, counts] = await Promise.all([
        loadDraftAction().catch(() => null),
        getChannelCountsAction().catch(() => null),
      ]);
      if (counts) setChannelCounts(counts);
      if (draft) {
        if (draft.category) setCategory(draft.category);
        if (draft.audience) setAudience(draft.audience);
        if (draft.channels.length > 0) setSelectedChannels(new Set(draft.channels));
        setTitle(draft.title);
        setBody(draft.body);
      }
    })();
  }, []);

  const isFormLocked = stage === "previewing" || stage === "confirming";

  function toggleChannel(ch: BroadcastChannel) {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  }

  function buildCommand(): Omit<BroadcastCommand, "actorId"> | null {
    if (!category || !audience || !title.trim() || body.trim().length < 10) return null;
    if (selectedChannels.size === 0) return null;
    const channels: BroadcastChannel[] = [...selectedChannels];
    return {
      category,
      audienceFilter: audience,
      message: { title: title.trim(), body: body.trim() },
      channels,
      attachMenuAfterSend: false,
    };
  }

  const isPreviewValid =
    Boolean(category && audience && title.trim() && body.trim().length >= 10) &&
    selectedChannels.size > 0;

  function handlePreview() {
    const command = buildCommand();
    if (!command) return;
    setErrorMsg(null);
    setStage("previewing");
    startTransition(async () => {
      try {
        const result = await previewBroadcastAction(command);
        setPreview(result);
        setStage("previewed");
      } catch {
        setStage("error");
        setErrorMsg("Ошибка при получении предпросмотра. Попробуйте ещё раз.");
      }
    });
  }

  function handleConfirm() {
    const command = buildCommand();
    if (!command || !preview) return;
    setStage("confirming");
    startTransition(async () => {
      try {
        const { auditEntry } = await executeBroadcastAction(command);
        setSentEntry(auditEntry);
        setStage("sent");
        onBroadcastSent?.(auditEntry);
      } catch (err) {
        setStage("error");
        setErrorMsg(
          err instanceof Error && err.message === BROADCAST_DELIVERY_CAP_EXCEEDED_CODE
            ? "Слишком много сообщений в одной рассылке. Уменьшите аудиторию или каналы."
            : "Ошибка при отправке рассылки. Попробуйте ещё раз.",
        );
      }
    });
  }

  function handleCancelConfirm() {
    setPreview(null);
    setStage("idle");
  }

  function handleReset() {
    setCategory("organizational");
    setAudience("");
    setSelectedChannels(new Set(BROADCAST_DEFAULT_CHANNELS));
    setTitle("");
    setBody("");
    setPreview(null);
    setSentEntry(null);
    setErrorMsg(null);
    setStage("idle");
  }

  async function handleSaveDraft() {
    setDraftSaving(true);
    setDraftSaved(false);
    try {
      await saveDraftAction({
        category: category || null,
        audience: audience || null,
        channels: [...selectedChannels],
        title,
        body,
      });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2500);
    } finally {
      setDraftSaving(false);
    }
  }

  if (stage === "sent" && preview && sentEntry) {
    return (
      <div className="flex flex-col gap-4">
        <BroadcastSentMessage preview={preview} />
        <button
          type="button"
          onClick={handleReset}
          className="self-start rounded-md border border-border px-4 py-2 text-sm"
        >
          Создать новую рассылку
        </button>
      </div>
    );
  }

  if ((stage === "previewed" || stage === "confirming") && preview) {
    const command = buildCommand();
    if (!command) return null;
    return (
      <BroadcastConfirmStep
        preview={preview}
        command={command}
        onConfirm={handleConfirm}
        onCancel={handleCancelConfirm}
        isLoading={isPending || stage === "confirming"}
      />
    );
  }

  return (
    <div id="broadcast-form" className="flex flex-col divide-y divide-border">
      {(stage === "error" || errorMsg) && (
        <div className="px-3 py-2">
          <p
            id="broadcast-error"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMsg ?? "Произошла ошибка."}
          </p>
        </div>
      )}

      {/* Audience */}
      <div className="px-3 py-2.5">
        <label
          htmlFor="broadcast-audience"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Аудитория · кому
        </label>
        <BroadcastAudienceSelect
          id="broadcast-audience"
          value={audience}
          onChange={setAudience}
          disabled={isFormLocked}
        />
        {audience && isAudienceEstimateApproximate(audience) ? (
          <p
            id="broadcast-audience-form-warning"
            className="mt-1 text-[10px] text-amber-700 dark:text-amber-500"
          >
            Для этой аудитории число получателей считается как «все клиенты».
          </p>
        ) : null}
      </div>

      {/* Category chips — order: Организационное · Важное · Сервисное · Рекламное */}
      <div className="px-3 py-2.5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Категория
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BROADCAST_FORM_CATEGORIES.map(({ value: v, label }) => (
            <button
              key={v}
              type="button"
              disabled={isFormLocked}
              onClick={() => setCategory(category === v ? "" : v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                category === v
                  ? "bg-primary/15 text-primary"
                  : "border border-border text-muted-foreground hover:bg-muted/40",
                isFormLocked && "opacity-60",
              )}
              aria-pressed={category === v}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Channel tiles — 5 channels: Telegram · MAX · Push · SMS · Email */}
      <div className="px-3 py-2.5">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Каналы · куда отправить
        </p>
        <div className="grid grid-cols-3 gap-2">
          {BROADCAST_ACTIVE_CHANNELS.map((ch) => {
            const active = selectedChannels.has(ch);
            const count = channelCounts ? channelCounts[ch as keyof BroadcastChannelCounts] : null;
            return (
              <label
                key={ch}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-2 py-2 transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border bg-background hover:bg-muted/30",
                  isFormLocked && "pointer-events-none opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={isFormLocked}
                  onChange={() => toggleChannel(ch)}
                  className="sr-only"
                />
                <span className={cn("text-xs font-semibold", active && "text-primary")}>
                  {CHANNEL_TILE_LABELS[ch]}
                </span>
                {count !== null && (
                  <span className="text-[10px] text-muted-foreground">{count}</span>
                )}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Один человек может получить по нескольким каналам — это нормально.
        </p>
      </div>

      {/* Title */}
      <div className="px-3 py-2.5">
        <label
          htmlFor="broadcast-title"
          className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Заголовок <span aria-hidden>*</span>
        </label>
        <input
          id="broadcast-title"
          type="text"
          value={title}
          maxLength={200}
          disabled={isFormLocked}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: Изменение расписания на следующей неделе"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <label
            htmlFor="broadcast-body"
            className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Текст сообщения <span aria-hidden>*</span>
          </label>
          <span className="text-[10px] text-muted-foreground">
            {body.length} / 800
          </span>
        </div>
        <textarea
          id="broadcast-body"
          value={body}
          maxLength={800}
          disabled={isFormLocked}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст рассылки (минимум 10 символов)"
          rows={5}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          id="broadcast-preview-button"
          onClick={handlePreview}
          disabled={!isPreviewValid || isFormLocked || isPending}
          className="rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {stage === "previewing" ? "Загрузка…" : "Предпросмотр"}
        </button>
        <button
          type="button"
          onClick={() => void handleSaveDraft()}
          disabled={draftSaving || isFormLocked}
          className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 disabled:opacity-50"
        >
          {draftSaving ? "Сохранение…" : draftSaved ? "Черновик сохранён ✓" : "Сохранить черновик"}
        </button>
      </div>
    </div>
  );
}
