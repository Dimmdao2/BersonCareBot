"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TREATMENT_PROGRAM_TEMPLATES_PATH } from "../paths";

export function NewTemplateForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
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
        body: JSON.stringify({ title: t }),
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
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="tpl-title">Название шаблона</Label>
        <Input
          id="tpl-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={2000}
          required
          autoFocus
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Создание…" : "Создать"}
        </Button>
        <Link href={TREATMENT_PROGRAM_TEMPLATES_PATH} className={cn(buttonVariants({ variant: "outline" }))}>
          Отмена
        </Link>
      </div>
    </form>
  );
}
