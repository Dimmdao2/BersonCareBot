"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
const OVERVIEW = "/api/admin/booking-engine/overview";

type Block = {
  id: string;
  startAt: string;
  endAt: string;
  blockType: string;
  title: string | null;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
};

type Catalog = {
  specialists: { id: string; fullName: string }[];
  branches: { id: string; title: string }[];
  rooms: { id: string; title: string }[];
};

function scopeLabel(
  block: Block,
  catalog: Catalog | null,
): string {
  const parts: string[] = [];
  if (block.specialistId) {
    parts.push(catalog?.specialists.find((s) => s.id === block.specialistId)?.fullName ?? block.specialistId);
  }
  if (block.branchId) {
    parts.push(catalog?.branches.find((b) => b.id === block.branchId)?.title ?? block.branchId);
  }
  if (block.roomId) {
    parts.push(catalog?.rooms.find((r) => r.id === block.roomId)?.title ?? block.roomId);
  }
  return parts.length > 0 ? parts.join(" · ") : "Вся клиника";
}

export function BookingScheduleBlocksSection() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [blockType, setBlockType] = useState<"block" | "absence">("block");
  const [title, setTitle] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [filterSpecialistId, setFilterSpecialistId] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterRoomId, setFilterRoomId] = useState("");

  const specialistLabel = useMemo(
    () => catalog?.specialists.find((s) => s.id === specialistId)?.fullName,
    [catalog, specialistId],
  );
  const branchLabel = useMemo(
    () => catalog?.branches.find((b) => b.id === branchId)?.title,
    [catalog, branchId],
  );
  const roomLabel = useMemo(() => catalog?.rooms.find((r) => r.id === roomId)?.title, [catalog, roomId]);

  const loadCatalog = useCallback(async () => {
    const res = await fetch(OVERVIEW);
    const json = (await res.json()) as {
      ok?: boolean;
      specialists?: Catalog["specialists"];
      branches?: Catalog["branches"];
      rooms?: Catalog["rooms"];
    };
    if (json.ok && json.specialists && json.branches && json.rooms) {
      setCatalog({ specialists: json.specialists, branches: json.branches, rooms: json.rooms });
    }
  }, []);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterSpecialistId) qs.set("specialistId", filterSpecialistId);
    if (filterBranchId) qs.set("branchId", filterBranchId);
    if (filterRoomId) qs.set("roomId", filterRoomId);
    const res = await fetch(`${BASE}?${qs.toString()}`);
    const json = (await res.json()) as { ok?: boolean; blocks?: Block[]; error?: string };
    if (!json.ok || !json.blocks) {
      setError(json.error ?? "load_failed");
      return;
    }
    setBlocks(json.blocks);
    setError(null);
  }, [filterBranchId, filterRoomId, filterSpecialistId]);

  useEffect(() => {
    startTransition(() => {
      void loadCatalog();
    });
  }, [loadCatalog]);

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
          specialistId: specialistId || null,
          branchId: branchId || null,
          roomId: roomId || null,
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
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label>Фильтр: специалист</Label>
            <Select
              value={filterSpecialistId || "__all__"}
              onValueChange={(v) => setFilterSpecialistId(v === "__all__" ? "" : v)}
            >
              <SelectTrigger
                displayLabel={
                  filterSpecialistId
                    ? catalog?.specialists.find((s) => s.id === filterSpecialistId)?.fullName
                    : "Все"
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.specialists ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.fullName}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Фильтр: филиал</Label>
            <Select value={filterBranchId || "__all__"} onValueChange={(v) => setFilterBranchId(v === "__all__" ? "" : v)}>
              <SelectTrigger
                displayLabel={
                  filterBranchId ? catalog?.branches.find((b) => b.id === filterBranchId)?.title : "Все"
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.title}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Фильтр: кабинет</Label>
            <Select value={filterRoomId || "__all__"} onValueChange={(v) => setFilterRoomId(v === "__all__" ? "" : v)}>
              <SelectTrigger
                displayLabel={filterRoomId ? catalog?.rooms.find((r) => r.id === filterRoomId)?.title : "Все"}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.rooms ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id} label={r.title}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
          <div className="flex flex-col gap-1">
            <Label>Специалист</Label>
            <Select value={specialistId || "__none__"} onValueChange={(v) => setSpecialistId(v === "__none__" ? "" : v)}>
              <SelectTrigger displayLabel={specialistId ? specialistLabel : "Вся клиника"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Вся клиника">
                  Вся клиника
                </SelectItem>
                {(catalog?.specialists ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id} label={s.fullName}>
                    {s.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Филиал</Label>
            <Select value={branchId || "__none__"} onValueChange={(v) => setBranchId(v === "__none__" ? "" : v)}>
              <SelectTrigger displayLabel={branchId ? branchLabel : "Все"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.branches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id} label={b.title}>
                    {b.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Кабинет</Label>
            <Select value={roomId || "__none__"} onValueChange={(v) => setRoomId(v === "__none__" ? "" : v)}>
              <SelectTrigger displayLabel={roomId ? roomLabel : "Все"}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" label="Все">
                  Все
                </SelectItem>
                {(catalog?.rooms ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id} label={r.title}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="button" onClick={createBlock} disabled={pending || !startAt || !endAt}>
          Добавить
        </Button>
        <ul className="space-y-2 text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <span>
                {scopeLabel(b, catalog)} · {b.blockType === "absence" ? "Отсутствие" : "Блок"} ·{" "}
                {new Date(b.startAt).toLocaleString("ru-RU")} — {new Date(b.endAt).toLocaleString("ru-RU")}
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
