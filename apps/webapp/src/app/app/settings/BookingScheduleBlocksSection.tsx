"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const BASE = "/api/admin/booking-engine/schedule-blocks";

type Block = {
  id: string;
  startAt: string;
  endAt: string;
  blockType: string;
  title: string | null;
};

export function BookingScheduleBlocksSection() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [blockType, setBlockType] = useState<"block" | "absence">("block");
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(BASE);
    const json = (await res.json()) as { ok?: boolean; blocks?: Block[]; error?: string };
    if (!json.ok || !json.blocks) {
      setError(json.error ?? "load_failed");
      return;
    }
    setBlocks(json.blocks);
    setError(null);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function createBlock() {
    if (!startAt || !endAt) return;
    startTransition(async () => {
      const res = await fetch(BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: new Date(startAt).toISOString(),
          endAt: new Date(endAt).toISOString(),
          blockType,
          title: title.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean };
      if (!json.ok) {
        setError("create_failed");
        return;
      }
      setStartAt("");
      setEndAt("");
      setTitle("");
      await load();
    });
  }

  function removeBlock(id: string) {
    startTransition(async () => {
      await fetch(`${BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Блокировки расписания</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <Label>Начало</Label>
            <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Конец</Label>
            <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <Label>Тип</Label>
            <Select value={blockType} onValueChange={(v) => setBlockType(v as "block" | "absence")}>
              <SelectTrigger displayLabel={blockType === "block" ? "Блок" : "Отсутствие"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block" label="Блок">
                  Блок
                </SelectItem>
                <SelectItem value="absence" label="Отсутствие">
                  Отсутствие
                </SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
        </div>
        <Button type="button" onClick={createBlock} disabled={pending || !startAt || !endAt}>
          Добавить
        </Button>
        <ul className="space-y-2 text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <span>
                {b.blockType === "absence" ? "Отсутствие" : "Блок"} · {new Date(b.startAt).toLocaleString("ru-RU")} —{" "}
                {new Date(b.endAt).toLocaleString("ru-RU")}
                {b.title ? ` · ${b.title}` : ""}
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => removeBlock(b.id)} disabled={pending}>
                Удалить
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
