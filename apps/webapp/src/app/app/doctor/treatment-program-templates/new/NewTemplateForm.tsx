"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "../paths";

const TEMPLATE_STATUS_LABEL: Record<"draft" | "published" | "archived", string> = {
  draft: "Черновик",
  published: "Опубликован",
  archived: "Архив",
};

export type NewTemplateFormProps = {
  /** Показать ссылку «Отмена» на список шаблонов (страница `/new`). */
  showCancelLink?: boolean;
  className?: string;
  /** id поля названия — чтобы не конфликтовать при нескольких формах в дереве. */
  titleInputId?: string;
  /**
   * Поле статуса при создании (`POST` передаёт `status`).
   * По умолчанию `false` — сервер создаёт черновик (`draft`), как в inline-каталоге.
   * Передайте `true` только если нужен явный выбор статуса на отдельной странице.
   */
  showStatusField?: boolean;
};

export function NewTemplateForm({
  showCancelLink = true,
  className,
  titleInputId = "tpl-title",
  showStatusField: showStatusFieldProp,
}: NewTemplateFormProps) {
  const router = useRouter();
  const showStatusField = showStatusFieldProp ?? false;
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const t = title.trim();
    if (!t) {
      setError("Укажите название");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/doctor/treatment-program-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, ...(showStatusField ? { status } : {}) }),
      });
      const json = (await res.json()) as { ok?: boolean; item?: { id: string }; error?: string };
      if (!res.ok || !json.ok || !json.item) {
        setError(json.error ?? "Не удалось создать");
        return;
      }
      router.push(`${TREATMENT_PROGRAM_TEMPLATES_PATH}/${json.item.id}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={cn("flex max-w-xl flex-col gap-4", className)}>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={titleInputId}>Название шаблона</Label>
        <Input
          id={titleInputId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={2000}
          required
          autoFocus={showCancelLink}
        />
      </div>
      {showStatusField ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${titleInputId}-status`}>Статус</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger id={`${titleInputId}-status`} size="sm" className="w-full max-w-md text-left">
              <SelectValue>{TEMPLATE_STATUS_LABEL[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Черновик</SelectItem>
              <SelectItem value="published">Опубликован</SelectItem>
              <SelectItem value="archived">Архив</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Создание…" : "Создать"}
        </Button>
        {showCancelLink ? (
          <Link href={TREATMENT_PROGRAM_TEMPLATES_PATH} className={cn(buttonVariants({ variant: "outline" }))}>
            Отмена
          </Link>
        ) : null}
      </div>
    </form>
  );
}
