"use client";

import { useTransition, useState } from "react";
import type {
  BroadcastAuditEntry,
  BroadcastAudienceFilter,
  BroadcastCategory,
  BroadcastChannel,
  BroadcastCommand,
  BroadcastPreviewResult,
} from "@/modules/doctor-broadcasts/ports";
import { BROADCAST_PLANNED_CHANNELS } from "@/modules/doctor-broadcasts/broadcastChannels";
import { CATEGORY_LABELS, CHANNEL_LABELS, isAudienceEstimateApproximate } from "./labels";
import { BroadcastAudienceSelect } from "./BroadcastAudienceSelect";
import { BroadcastConfirmStep } from "./BroadcastConfirmStep";
import { BroadcastSentMessage } from "./BroadcastSentMessage";
import { previewBroadcastAction, executeBroadcastAction } from "./actions";
import { BROADCAST_DELIVERY_CAP_EXCEEDED_CODE } from "@/modules/doctor-broadcasts/deliveryQueueKind";

type Stage = "idle" | "previewing" | "previewed" | "confirming" | "sent" | "error";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [BroadcastCategory, string][];

type Props = {
  onBroadcastSent?: (entry: BroadcastAuditEntry) => void;
};

export function BroadcastForm({ onBroadcastSent }: Props) {
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<BroadcastPreviewResult | null>(null);
  const [sentEntry, setSentEntry] = useState<BroadcastAuditEntry | null>(null);

  const [category, setCategory] = useState<BroadcastCategory | "">("");
  const [audience, setAudience] = useState<BroadcastAudienceFilter | "">("");
  const [channelBot, setChannelBot] = useState(true);
  const [channelSms, setChannelSms] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const isFormLocked = stage === "previewing" || stage === "confirming";

  function buildCommand(): Omit<BroadcastCommand, "actorId"> | null {
    if (!category || !audience || !title.trim() || body.trim().length < 10) return null;
    if (!channelBot && !channelSms) return null;
    const channels: BroadcastChannel[] = [];
    if (channelBot) channels.push("bot_message");
    if (channelSms) channels.push("sms");
    return {
      category,
      audienceFilter: audience,
      message: { title: title.trim(), body: body.trim() },
      channels,
    };
  }

  const isPreviewValid =
    Boolean(category && audience && title.trim() && body.trim().length >= 10) && (channelBot || channelSms);

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
    setCategory("");
    setAudience("");
    setChannelBot(true);
    setChannelSms(true);
    setTitle("");
    setBody("");
    setPreview(null);
    setSentEntry(null);
    setErrorMsg(null);
    setStage("idle");
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
    <div id="broadcast-form" className="flex flex-col gap-4">
      {(stage === "error" || errorMsg) && (
        <p id="broadcast-error" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMsg ?? "Произошла ошибка."}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="broadcast-category" className="text-sm font-medium">
          Категория <span aria-hidden>*</span>
        </label>
        <select
          id="broadcast-category"
          value={category}
          disabled={isFormLocked}
          onChange={(e) => setCategory(e.target.value as BroadcastCategory)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            — выберите категорию —
          </option>
          {CATEGORY_OPTIONS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="broadcast-audience" className="text-sm font-medium">
          Аудитория <span aria-hidden>*</span>
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
            className="text-xs text-amber-700 dark:text-amber-500"
          >
            Для этой аудитории число получателей пока считается как «все клиенты», пока не появится фильтр в списке клиентов.
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">Каналы</legend>
        <label htmlFor="broadcast-channel-bot" className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            id="broadcast-channel-bot"
            type="checkbox"
            checked={channelBot}
            disabled={isFormLocked}
            onChange={(e) => setChannelBot(e.target.checked)}
          />
          {CHANNEL_LABELS.bot_message}
        </label>
        <label htmlFor="broadcast-channel-sms" className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            id="broadcast-channel-sms"
            type="checkbox"
            checked={channelSms}
            disabled={isFormLocked}
            onChange={(e) => setChannelSms(e.target.checked)}
          />
          {CHANNEL_LABELS.sms}
        </label>
        {BROADCAST_PLANNED_CHANNELS.map((code) => (
          <label
            key={code}
            className="flex cursor-not-allowed items-center gap-2 text-sm text-muted-foreground"
          >
            <input type="checkbox" disabled checked={false} readOnly className="pointer-events-none" />
            <span>
              {CHANNEL_LABELS[code]} <span className="text-xs">(скоро)</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="broadcast-title" className="text-sm font-medium">
          Заголовок <span aria-hidden>*</span>
        </label>
        <input
          id="broadcast-title"
          type="text"
          value={title}
          maxLength={200}
          disabled={isFormLocked}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Заголовок сообщения"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="broadcast-body" className="text-sm font-medium">
          Текст сообщения <span aria-hidden>*</span>
        </label>
        <textarea
          id="broadcast-body"
          value={body}
          disabled={isFormLocked}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Текст рассылки (минимум 10 символов)"
          rows={5}
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground text-right">{body.length} символов</p>
      </div>

      <button
        type="button"
        id="broadcast-preview-button"
        onClick={handlePreview}
        disabled={!isPreviewValid || isFormLocked || isPending}
        className="self-start rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {stage === "previewing" ? "Загрузка…" : "Предпросмотр"}
      </button>
    </div>
  );
}
