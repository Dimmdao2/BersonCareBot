"use client";

import { useId, useState, type ChangeEvent } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** Called with public path e.g. `/api/media/{uuid}` */
  onUploaded: (url: string, filename: string) => void;
};

export function MediaUploader({ onUploaded }: Props) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string; mime?: string };
      if (!res.ok) {
        setError(data.error === "file_too_large" ? "Файл больше 50 МБ" : data.error ?? "Ошибка загрузки");
        return;
      }
      if (data.ok && data.url) {
        onUploaded(data.url, file.name);
      }
    } catch {
      setError("Сеть недоступна");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input id={inputId} type="file" className="sr-only" onChange={onPick} disabled={pending} />
      <label
        htmlFor={inputId}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
      >
        {pending ? "Загрузка…" : "Загрузить файл"}
      </label>
      {error ? (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
