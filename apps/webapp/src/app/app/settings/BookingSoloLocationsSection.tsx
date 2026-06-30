"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { Switch } from "@/shared/ui/doctor/primitives/switch";
import {
  SOLO_BOOKING_UNAVAILABLE_MESSAGE,
  apiJson,
  ensureDefaultSpecialist,
  fetchSoloOverview,
  slugCityCode,
  type SoloOverview,
} from "@/app/app/settings/bookingSoloAdminApi";

const BASE = "/api/admin/booking-engine";

type BranchRow = SoloOverview["branches"][0];

export function BookingSoloLocationsSection() {
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [orgTitle, setOrgTitle] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("Europe/Moscow");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editShortTitle, setEditShortTitle] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editTimezone, setEditTimezone] = useState("Europe/Moscow");
  const [editSortOrder, setEditSortOrder] = useState("0");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const data = await fetchSoloOverview();
      if (!data) {
        setUnavailable(true);
        return;
      }
      setBranches(data.branches);
      setOrgTitle(data.organization?.title ?? "");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "load_failed");
    }
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  function run(fn: () => Promise<void>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await fn();
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "action_failed");
      }
    });
  }

  if (unavailable) {
    return (
      <p className="text-sm text-muted-foreground">{SOLO_BOOKING_UNAVAILABLE_MESSAGE}</p>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Локации</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <Label>Новая локация</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[10rem] flex-1"
              placeholder="Название"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              className="min-w-[12rem] flex-1"
              placeholder="Адрес"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || !title.trim()}
              onClick={() =>
                run(async () => {
                  await ensureDefaultSpecialist(orgTitle);
                  const maxOrder = branches.reduce((m, b) => Math.max(m, b.sortOrder), 0);
                  await apiJson(`${BASE}/branches`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: title.trim(),
                      cityCode: slugCityCode(title),
                      address: address.trim() || null,
                      timezone,
                      sortOrder: maxOrder + 10,
                    }),
                  });
                  setTitle("");
                  setAddress("");
                })
              }
            >
              Добавить
            </Button>
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Скрыть дополнительно" : "Дополнительно"}
          </button>
          {showAdvanced ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Label className="text-xs text-muted-foreground">Часовой пояс</Label>
              <Input
                className="h-8 w-48"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Локация</th>
                <th className="px-3 py-2 font-medium">Короткое название</th>
                <th className="px-3 py-2 font-medium">Адрес</th>
                <th className="px-3 py-2 font-medium">Порядок</th>
                <th className="px-3 py-2 font-medium">Показывать пациентам</th>
                <th className="px-3 py-2 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {[...branches]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "ru"))
                .map((b) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    {editId === b.id ? (
                      <Input className="h-8" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    ) : (
                      <span className={!b.isActive ? "text-muted-foreground line-through" : undefined}>
                        {b.title}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editId === b.id ? (
                      <Input
                        className="h-8 w-28"
                        placeholder="СПб, Мск"
                        maxLength={12}
                        value={editShortTitle}
                        onChange={(e) => setEditShortTitle(e.target.value.slice(0, 12))}
                      />
                    ) : (
                      (b.shortTitle ?? "—")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editId === b.id ? (
                      <Input className="h-8" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
                    ) : (
                      (b.address ?? "—")
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editId === b.id ? (
                      <Input
                        className="h-8 w-16"
                        type="number"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                      />
                    ) : (
                      b.sortOrder
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={b.isActive}
                      disabled={pending || editId === b.id}
                      onCheckedChange={(checked) =>
                        run(async () => {
                          await apiJson(`${BASE}/branches/${b.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: checked }),
                          });
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editId === b.id ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              await apiJson(`${BASE}/branches/${b.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  title: editTitle,
                                  shortTitle: editShortTitle.trim() || null,
                                  address: editAddress.trim() || null,
                                  timezone: editTimezone,
                                  sortOrder: Number(editSortOrder),
                                }),
                              });
                              setEditId(null);
                            })
                          }
                        >
                          OK
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={pending}
                          onClick={() => setEditId(null)}
                        >
                          ×
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={pending}
                        onClick={() => {
                          setEditId(b.id);
                          setEditTitle(b.title);
                          setEditShortTitle(b.shortTitle ?? "");
                          setEditAddress(b.address ?? "");
                          setEditTimezone(b.timezone);
                          setEditSortOrder(String(b.sortOrder));
                        }}
                      >
                        Изм.
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {branches.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Локаций пока нет.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
