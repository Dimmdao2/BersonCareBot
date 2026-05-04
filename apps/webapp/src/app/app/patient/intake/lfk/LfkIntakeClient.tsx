"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { routePaths } from "@/app-layer/routes/paths";

type State = "form" | "submitting" | "success" | "error";

export function LfkIntakeClient() {
  const router = useRouter();
  const [state, setState] = useState<State>("form");
  const [description, setDescription] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = description.trim().length >= 20;

  async function handleSubmit() {
    if (!canSubmit) return;
    setState("submitting");
    setErrorMessage(null);

    const attachmentUrls = attachmentUrl.trim() ? [attachmentUrl.trim()] : [];

    try {
      const res = await fetch("/api/patient/online-intake/lfk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), attachmentUrls }),
      });

      if (res.ok) {
        setState("success");
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setErrorMessage(data.message ?? "Произошла ошибка. Попробуйте ещё раз.");
        setState("error");
      }
    } catch {
      setErrorMessage("Не удалось отправить запрос. Проверьте подключение.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-green-700">Заявка отправлена</h2>
          <p className="text-sm text-muted-foreground">
            Врач свяжется с вами лично или через приложение в ближайшее время.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(routePaths.cabinet)}>
          Вернуться в кабинет
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">Онлайн-запрос: Реабилитация (ЛФК)</h2>
        <Badge variant="outline">Онлайн</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Опишите проблему, с которой обращаетесь. По возможности прикрепите врачебные выписки,
        снимки рентген / МРТ / КТ (архив или ссылку на облако).
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="lfk-description">
          Описание проблемы <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="lfk-description"
          className="min-h-32"
          placeholder="Опишите, что беспокоит: симптомы, давность, предыдущее лечение..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={state === "submitting"}
        />
        {description.trim().length > 0 && description.trim().length < 20 && (
          <p className="text-xs text-destructive">Минимум 20 символов</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="lfk-attachment">
          Ссылка на файлы (необязательно)
        </label>
        <Input
          id="lfk-attachment"
          type="url"
          placeholder="https://drive.google.com/..."
          value={attachmentUrl}
          onChange={(e) => setAttachmentUrl(e.target.value)}
          disabled={state === "submitting"}
        />
        <p className="text-xs text-muted-foreground">
          Ссылка на архив или облачное хранилище со снимками / выписками
        </p>
      </div>

      {state === "error" && errorMessage && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={state === "submitting"}
        >
          Назад
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || state === "submitting"}
        >
          {state === "submitting" ? "Отправка..." : "Отправить запрос"}
        </Button>
      </div>
    </div>
  );
}
