"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/doctor/primitives/select";

import { pickDefaultSpecialist } from "@/app/app/settings/bookingSoloAdminApi";
import { apiJson } from "@/shared/lib/apiJson";
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

function blockTypeLabel(blockType: string, solo: boolean): string {
  if (blockType === "absence") return "Отсутствие";
  return solo ? "Занято" : "Блок";
}

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

export function BookingScheduleBlocksSection({ soloUx = false }: { soloUx?: boolean }) {
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
    try {
      const json = await apiJson<{
        ok?: boolean;
        specialists?: (Catalog["specialists"][0] & { isActive?: boolean })[];
        branches?: Catalog["branches"];
        rooms?: Catalog["rooms"];
      }>(OVERVIEW);
      if (json.specialists && json.branches && json.rooms) {
        setCatalog({ specialists: json.specialists, branches: json.branches, rooms: json.rooms });
        if (soloUx) {
          const specialist = pickDefaultSpecialist(
            json.specialists.map((s) => ({
              id: s.id,
              fullName: s.fullName,
              isActive: s.isActive ?? true,
            })),
          );
          if (specialist) {
            setSpecialistId(specialist.id);
            setFilterSpecialistId(specialist.id);
          }
        }
      }
    } catch {
      // catalog load failure is non-critical; selects simply stay empty
    }
  }, [soloUx]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterSpecialistId) qs.set("specialistId", filterSpecialistId);
    if (filterBranchId) qs.set("branchId", filterBranchId);
    if (filterRoomId) qs.set("roomId", filterRoomId);
    try {
      const json = await apiJson<{ ok?: boolean; blocks?: Block[]; error?: string }>(`${BASE}?${qs.toString()}`);
      if (!json.blocks) {
        setError("load_failed");
        return;
      }
      setBlocks(json.blocks);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load_failed");
    }
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
      try {
        await apiJson(BASE, {
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
        setStartAt("");
        setEndAt("");
        setTitle("");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "create_failed");
      }
    });
  }

  function removeBlock(id: string) {
    startTransition(async () => {
      try {
        await apiJson(`${BASE}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch (e) {
        setError(e instanceof Error ? e.message : "delete_failed");
      }
      await load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{soloUx ? "Исключения" : "Блокировки расписания"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className={soloUx ? "grid gap-3 sm:grid-cols-1" : "grid gap-3 sm:grid-cols-3"}>
          {!soloUx ? (
          <div className="flex flex-col gap-1">
            <Label>Фильтр: специалист</Label>
            <Select
              value={filterSpecialistId || "__all__"}
              onValueChange={(v) => setFilterSpecialistId(!v || v === "__all__" ? "" : v)}
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
          ) : null}
          <div className="flex flex-col gap-1">
            <Label>{soloUx ? "Локация" : "Фильтр: филиал"}</Label>
            <Select value={filterBranchId || "__all__"} onValueChange={(v) => setFilterBranchId(!v || v === "__all__" ? "" : v)}>
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
          {!soloUx ? (
          <div className="flex flex-col gap-1">
            <Label>Фильтр: кабинет</Label>
            <Select value={filterRoomId || "__all__"} onValueChange={(v) => setFilterRoomId(!v || v === "__all__" ? "" : v)}>
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
          ) : null}
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
              <SelectTrigger displayLabel={blockTypeLabel(blockType, soloUx)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block" label={blockTypeLabel("block", soloUx)}>
                  {blockTypeLabel("block", soloUx)}
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
          {!soloUx ? (
          <div className="flex flex-col gap-1">
            <Label>Специалист</Label>
            <Select value={specialistId || "__none__"} onValueChange={(v) => setSpecialistId(!v || v === "__none__" ? "" : v)}>
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
          ) : null}
          <div className="flex flex-col gap-1">
            <Label>{soloUx ? "Локация" : "Филиал"}</Label>
            <Select value={branchId || "__none__"} onValueChange={(v) => setBranchId(!v || v === "__none__" ? "" : v)}>
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
          {!soloUx ? (
          <div className="flex flex-col gap-1">
            <Label>Кабинет</Label>
            <Select value={roomId || "__none__"} onValueChange={(v) => setRoomId(!v || v === "__none__" ? "" : v)}>
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
          ) : null}
        </div>
        <Button type="button" onClick={createBlock} disabled={pending || !startAt || !endAt}>
          Добавить
        </Button>
        <ul className="space-y-2 text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <span>
                {scopeLabel(b, catalog)} · {blockTypeLabel(b.blockType, soloUx)} ·{" "}
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
