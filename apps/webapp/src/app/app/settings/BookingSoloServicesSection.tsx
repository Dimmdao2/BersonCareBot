"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  SOLO_BOOKING_UNAVAILABLE_MESSAGE,
  apiJson,
  fetchSoloOverview,
  minorToRublesInput,
  parseRublesInput,
  rublesToMinor,
  type SoloOverview,
} from "@/app/app/settings/bookingSoloAdminApi";

const BASE = "/api/admin/booking-engine";

type ServiceRow = SoloOverview["services"][0];

export function BookingSoloServicesSection() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("60");
  const [priceRub, setPriceRub] = useState("5000");
  const [patientVisible, setPatientVisible] = useState(true);
  const [usableInPackages, setUsableInPackages] = useState(true);
  const [prepaymentApplicable, setPrepaymentApplicable] = useState(false);
  const [onlinePaymentApplicable, setOnlinePaymentApplicable] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPriceRub, setEditPriceRub] = useState("");
  const [editUsableInPackages, setEditUsableInPackages] = useState(true);
  const [editPrepaymentApplicable, setEditPrepaymentApplicable] = useState(false);
  const [editOnlinePaymentApplicable, setEditOnlinePaymentApplicable] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setUnavailable(false);
    try {
      const data = await fetchSoloOverview();
      if (!data) {
        setUnavailable(true);
        return;
      }
      setServices(data.services);
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
        <CardTitle className="text-base">Услуги</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <Label>Новая услуга</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[10rem] flex-1"
              placeholder="Название"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              className="min-w-[12rem] flex-1"
              placeholder="Описание для пациента"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Input
              className="w-20"
              type="number"
              min={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              aria-label="Длительность в минутах"
            />
            <Input
              className="w-28"
              type="number"
              min={0}
              step="0.01"
              value={priceRub}
              onChange={(e) => setPriceRub(e.target.value)}
              aria-label="Цена в рублях"
            />
            <span className="text-sm text-muted-foreground">₽</span>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={patientVisible} onCheckedChange={setPatientVisible} />
              Доступна пациентам
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={usableInPackages} onCheckedChange={setUsableInPackages} />
              Абонементы
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={prepaymentApplicable} onCheckedChange={setPrepaymentApplicable} />
              Предоплата
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlinePaymentApplicable} onCheckedChange={setOnlinePaymentApplicable} />
              Онлайн-оплата
            </label>
            <Button
              type="button"
              size="sm"
              disabled={pending || !title.trim()}
              onClick={() =>
                run(async () => {
                  const rub = parseRublesInput(priceRub);
                  await apiJson(`${BASE}/services`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      title: title.trim(),
                      description: description.trim() || null,
                      durationMinutes: Number(duration),
                      priceMinor: rublesToMinor(rub),
                      publicWidgetVisible: patientVisible,
                      adminManualOnly: !patientVisible,
                      usableInPackages,
                      prepaymentApplicable,
                      onlinePaymentApplicable,
                    }),
                  });
                  setTitle("");
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
                <th className="px-3 py-2 font-medium">Услуга</th>
                <th className="px-3 py-2 font-medium">Мин</th>
                <th className="px-3 py-2 font-medium">Цена</th>
                <th className="px-3 py-2 font-medium">Доступна пациентам</th>
                <th className="px-3 py-2 font-medium">Абон.</th>
                <th className="px-3 py-2 font-medium">Предопл.</th>
                <th className="px-3 py-2 font-medium">Онлайн</th>
                <th className="px-3 py-2 font-medium text-right">Действия</th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const visibleToPatient = s.publicWidgetVisible && !s.adminManualOnly;
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <div className="space-y-1">
                          <Input className="h-8" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                          <Input
                            className="h-8"
                            placeholder="Описание"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                          />
                        </div>
                      ) : (
                        <span className={!s.isActive ? "text-muted-foreground line-through" : undefined}>
                          {s.title}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <Input
                          className="h-8 w-16"
                          type="number"
                          value={editDuration}
                          onChange={(e) => setEditDuration(e.target.value)}
                        />
                      ) : (
                        s.durationMinutes
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <Input
                          className="h-8 w-24"
                          type="number"
                          step="0.01"
                          value={editPriceRub}
                          onChange={(e) => setEditPriceRub(e.target.value)}
                        />
                      ) : (
                        `${(s.priceMinor / 100).toLocaleString("ru-RU")} ₽`
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? null : (
                        <Switch
                          checked={visibleToPatient}
                          disabled={pending || !s.isActive}
                          onCheckedChange={(checked) =>
                            run(async () => {
                              await apiJson(`${BASE}/services/${s.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  publicWidgetVisible: checked,
                                  adminManualOnly: !checked,
                                }),
                              });
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <Switch checked={editUsableInPackages} onCheckedChange={setEditUsableInPackages} />
                      ) : (
                        <Switch
                          checked={s.usableInPackages}
                          disabled={pending || !s.isActive}
                          onCheckedChange={(checked) =>
                            run(async () => {
                              await apiJson(`${BASE}/services/${s.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ usableInPackages: checked }),
                              });
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <Switch
                          checked={editPrepaymentApplicable}
                          onCheckedChange={setEditPrepaymentApplicable}
                        />
                      ) : (
                        <Switch
                          checked={s.prepaymentApplicable}
                          disabled={pending || !s.isActive}
                          onCheckedChange={(checked) =>
                            run(async () => {
                              await apiJson(`${BASE}/services/${s.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ prepaymentApplicable: checked }),
                              });
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editId === s.id ? (
                        <Switch
                          checked={editOnlinePaymentApplicable}
                          onCheckedChange={setEditOnlinePaymentApplicable}
                        />
                      ) : (
                        <Switch
                          checked={s.onlinePaymentApplicable}
                          disabled={pending || !s.isActive}
                          onCheckedChange={(checked) =>
                            run(async () => {
                              await apiJson(`${BASE}/services/${s.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ onlinePaymentApplicable: checked }),
                              });
                            })
                          }
                        />
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
                                const rub = parseRublesInput(editPriceRub);
                                await apiJson(`${BASE}/services/${s.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    title: editTitle,
                                    description: editDescription.trim() || null,
                                    durationMinutes: Number(editDuration),
                                    priceMinor: rublesToMinor(rub),
                                    usableInPackages: editUsableInPackages,
                                    prepaymentApplicable: editPrepaymentApplicable,
                                    onlinePaymentApplicable: editOnlinePaymentApplicable,
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
                              setEditTitle(s.title);
                              setEditDescription(s.description ?? "");
                              setEditDuration(String(s.durationMinutes));
                              setEditPriceRub(minorToRublesInput(s.priceMinor));
                              setEditUsableInPackages(s.usableInPackages);
                              setEditPrepaymentApplicable(s.prepaymentApplicable);
                              setEditOnlinePaymentApplicable(s.onlinePaymentApplicable);
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
                                  await apiJson(`${BASE}/services/${s.id}`, { method: "DELETE" });
                                } else {
                                  await apiJson(`${BASE}/services/${s.id}`, {
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
                );
              })}
            </tbody>
          </table>
          {services.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Услуг пока нет.</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
