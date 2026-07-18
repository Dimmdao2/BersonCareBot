"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/doctor/primitives/card";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Label } from "@/shared/ui/doctor/primitives/label";
import { apiJson } from "@/app/app/settings/bookingSoloAdminApi";

const BASE = "/api/admin/booking-engine";

type SpecialistRow = {
  id: string;
  fullName: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
};

/**
 * Управление специалистами расписания (владелец/себя, добавленные сотрудники) — не путать
 * с личными «Настройками специалиста» аккаунта. Тот же canonical booking-engine specialist
 * domain, что использует рабочее расписание (owner-review §4, п.2).
 */
export function BookingSoloSpecialistsSection() {
  const [specialists, setSpecialists] = useState<SpecialistRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [fullName, setFullName] = useState("");
  const [description, setDescription] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const json = await apiJson<{ ok: boolean; specialists: SpecialistRow[] }>(`${BASE}/specialists`);
      setSpecialists(json.specialists);
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Специалисты расписания</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Специалисты, на которых ведётся календарь записи (включая владельца/себя). Не связано с личными
          «Настройками специалиста» аккаунта.
        </p>
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <Label>Новый специалист</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[10rem] flex-1"
              placeholder="ФИО"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <Input
              className="min-w-[12rem] flex-1"
              placeholder="Описание (необязательно)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={pending || !fullName.trim()}
              onClick={() =>
                run(async () => {
                  await apiJson(`${BASE}/specialists`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      fullName: fullName.trim(),
                      description: description.trim() || null,
                    }),
                  });
                  setFullName("");
                  setDescription("");
                })
              }
            >
              Добавить
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Специалист</th>
                <th className="px-3 py-2 font-medium">Описание</th>
                <th className="px-3 py-2 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {specialists.map((s) => (
                <tr key={s.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    {editId === s.id ? (
                      <Input className="h-8" value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
                    ) : (
                      <span className={!s.isActive ? "text-muted-foreground line-through" : undefined}>
                        {s.fullName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editId === s.id ? (
                      <Input
                        className="h-8"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    ) : (
                      (s.description ?? "—")
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editId === s.id ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-2"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              await apiJson(`${BASE}/specialists/${s.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  fullName: editFullName.trim(),
                                  description: editDescription.trim() || null,
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
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={pending}
                          onClick={() => {
                            setEditId(s.id);
                            setEditFullName(s.fullName);
                            setEditDescription(s.description ?? "");
                          }}
                        >
                          Изм.
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              if (s.isActive) {
                                await apiJson(`${BASE}/specialists/${s.id}`, { method: "DELETE" });
                              } else {
                                await apiJson(`${BASE}/specialists/${s.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ isActive: true }),
                                });
                              }
                            })
                          }
                        >
                          {s.isActive ? "Выкл." : "Вкл."}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {specialists.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Специалистов пока нет.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
