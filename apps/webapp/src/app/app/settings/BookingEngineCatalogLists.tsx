"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { Input } from "@/shared/ui/doctor/primitives/input";

import {
  minorToRublesInput,
  parseRublesInput,
  rublesToMinor,
} from "@/app/app/settings/bookingSoloAdminApi";

const BASE = "/api/admin/booking-engine";

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  return res.json() as Promise<T>;
}

type RowActionsProps = {
  isPending: boolean;
  editing: boolean;
  isActive: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onToggleActive: () => void;
};

function RowActions({
  isPending,
  editing,
  isActive,
  onEdit,
  onSave,
  onCancel,
  onToggleActive,
}: RowActionsProps) {
  if (editing) {
    return (
      <>
        <Button type="button" size="sm" className="h-7 px-2" disabled={isPending} onClick={onSave}>
          OK
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={isPending} onClick={onCancel}>
          ×
        </Button>
      </>
    );
  }
  return (
    <>
      <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={isPending} onClick={onEdit}>
        Изм.
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        disabled={isPending}
        onClick={onToggleActive}
      >
        {isActive ? "Выкл." : "Вкл."}
      </Button>
    </>
  );
}

type CatalogListProps = {
  isPending: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  layout?: "list" | "table";
};

function CatalogTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function useCatalogAction(onChanged: () => Promise<void>, onError: (message: string) => void) {
  return async (fn: () => Promise<void>) => {
    try {
      await fn();
      await onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : "action_failed");
    }
  };
}

type BranchRow = { id: string; title: string; cityCode: string; isActive: boolean };

export function BookingEngineBranchList({
  branches,
  isPending,
  onChanged,
  onError,
  layout = "list",
}: CatalogListProps & { branches: BranchRow[] }) {
  const wrap = useCatalogAction(onChanged, onError);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCity, setEditCity] = useState("");

  if (layout === "table") {
    return (
      <CatalogTableShell>
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Название</th>
            <th className="px-3 py-2 font-medium">Город</th>
            <th className="px-3 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {branches.map((b) => (
            <tr key={b.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {editId === b.id ? (
                  <Input
                    className="h-8"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                ) : (
                  <span className={!b.isActive ? "text-muted-foreground line-through" : undefined}>
                    {b.title}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {editId === b.id ? (
                  <Input className="h-8 w-24" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
                ) : (
                  b.cityCode
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  isPending={isPending}
                  editing={editId === b.id}
                  isActive={b.isActive}
                  onEdit={() => {
                    setEditId(b.id);
                    setEditTitle(b.title);
                    setEditCity(b.cityCode);
                  }}
                  onCancel={() => setEditId(null)}
                  onSave={() =>
                    void wrap(async () => {
                      const res = await apiJson<{ ok: boolean }>(`${BASE}/branches/${b.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: editTitle, cityCode: editCity }),
                      });
                      if (!res.ok) throw new Error("branch_patch_failed");
                      setEditId(null);
                    })
                  }
                  onToggleActive={() =>
                    void wrap(async () => {
                      const res = b.isActive
                        ? await apiJson<{ ok: boolean }>(`${BASE}/branches/${b.id}`, { method: "DELETE" })
                        : await apiJson<{ ok: boolean }>(`${BASE}/branches/${b.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: true }),
                          });
                      if (!res.ok) throw new Error("branch_toggle_failed");
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </CatalogTableShell>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {branches.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-2">
          {editId === b.id ? (
            <>
              <Input
                className="h-8 min-w-[8rem] flex-1"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <Input className="h-8 w-24" value={editCity} onChange={(e) => setEditCity(e.target.value)} />
            </>
          ) : (
            <span className={!b.isActive ? "text-muted-foreground line-through" : undefined}>
              {b.title} ({b.cityCode}){!b.isActive ? " — выкл." : ""}
            </span>
          )}
          <RowActions
            isPending={isPending}
            editing={editId === b.id}
            isActive={b.isActive}
            onEdit={() => {
              setEditId(b.id);
              setEditTitle(b.title);
              setEditCity(b.cityCode);
            }}
            onCancel={() => setEditId(null)}
            onSave={() =>
              void wrap(async () => {
                const res = await apiJson<{ ok: boolean }>(`${BASE}/branches/${b.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: editTitle, cityCode: editCity }),
                });
                if (!res.ok) throw new Error("branch_patch_failed");
                setEditId(null);
              })
            }
            onToggleActive={() =>
              void wrap(async () => {
                const res = b.isActive
                  ? await apiJson<{ ok: boolean }>(`${BASE}/branches/${b.id}`, { method: "DELETE" })
                  : await apiJson<{ ok: boolean }>(`${BASE}/branches/${b.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isActive: true }),
                    });
                if (!res.ok) throw new Error("branch_toggle_failed");
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

type RoomRow = { id: string; title: string; isActive: boolean };

export function BookingEngineRoomList({
  rooms,
  isPending,
  onChanged,
  onError,
  layout = "list",
}: CatalogListProps & { rooms: RoomRow[] }) {
  const wrap = useCatalogAction(onChanged, onError);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  if (layout === "table") {
    return (
      <CatalogTableShell>
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Кабинет</th>
            <th className="px-3 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {editId === r.id ? (
                  <Input className="h-8" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                ) : (
                  <span className={!r.isActive ? "text-muted-foreground line-through" : undefined}>
                    {r.title}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  isPending={isPending}
                  editing={editId === r.id}
                  isActive={r.isActive}
                  onEdit={() => {
                    setEditId(r.id);
                    setEditTitle(r.title);
                  }}
                  onCancel={() => setEditId(null)}
                  onSave={() =>
                    void wrap(async () => {
                      const res = await apiJson<{ ok: boolean }>(`${BASE}/rooms/${r.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title: editTitle }),
                      });
                      if (!res.ok) throw new Error("room_patch_failed");
                      setEditId(null);
                    })
                  }
                  onToggleActive={() =>
                    void wrap(async () => {
                      const res = r.isActive
                        ? await apiJson<{ ok: boolean }>(`${BASE}/rooms/${r.id}`, { method: "DELETE" })
                        : await apiJson<{ ok: boolean }>(`${BASE}/rooms/${r.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: true }),
                          });
                      if (!res.ok) throw new Error("room_toggle_failed");
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </CatalogTableShell>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {rooms.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2">
          {editId === r.id ? (
            <Input
              className="h-8 min-w-[8rem] flex-1"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          ) : (
            <span className={!r.isActive ? "text-muted-foreground line-through" : undefined}>
              {r.title}
              {!r.isActive ? " — выкл." : ""}
            </span>
          )}
          <RowActions
            isPending={isPending}
            editing={editId === r.id}
            isActive={r.isActive}
            onEdit={() => {
              setEditId(r.id);
              setEditTitle(r.title);
            }}
            onCancel={() => setEditId(null)}
            onSave={() =>
              void wrap(async () => {
                const res = await apiJson<{ ok: boolean }>(`${BASE}/rooms/${r.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: editTitle }),
                });
                if (!res.ok) throw new Error("room_patch_failed");
                setEditId(null);
              })
            }
            onToggleActive={() =>
              void wrap(async () => {
                const res = r.isActive
                  ? await apiJson<{ ok: boolean }>(`${BASE}/rooms/${r.id}`, { method: "DELETE" })
                  : await apiJson<{ ok: boolean }>(`${BASE}/rooms/${r.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isActive: true }),
                    });
                if (!res.ok) throw new Error("room_toggle_failed");
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

type SpecialistRow = { id: string; fullName: string; isActive: boolean };

export function BookingEngineSpecialistList({
  specialists,
  isPending,
  onChanged,
  onError,
  layout = "list",
}: CatalogListProps & { specialists: SpecialistRow[] }) {
  const wrap = useCatalogAction(onChanged, onError);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  if (layout === "table") {
    return (
      <CatalogTableShell>
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Специалист</th>
            <th className="px-3 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {specialists.map((s) => (
            <tr key={s.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {editId === s.id ? (
                  <Input className="h-8" value={editName} onChange={(e) => setEditName(e.target.value)} />
                ) : (
                  <span className={!s.isActive ? "text-muted-foreground line-through" : undefined}>
                    {s.fullName}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                <RowActions
                  isPending={isPending}
                  editing={editId === s.id}
                  isActive={s.isActive}
                  onEdit={() => {
                    setEditId(s.id);
                    setEditName(s.fullName);
                  }}
                  onCancel={() => setEditId(null)}
                  onSave={() =>
                    void wrap(async () => {
                      const res = await apiJson<{ ok: boolean }>(`${BASE}/specialists/${s.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ fullName: editName }),
                      });
                      if (!res.ok) throw new Error("specialist_patch_failed");
                      setEditId(null);
                    })
                  }
                  onToggleActive={() =>
                    void wrap(async () => {
                      const res = s.isActive
                        ? await apiJson<{ ok: boolean }>(`${BASE}/specialists/${s.id}`, { method: "DELETE" })
                        : await apiJson<{ ok: boolean }>(`${BASE}/specialists/${s.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: true }),
                          });
                      if (!res.ok) throw new Error("specialist_toggle_failed");
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </CatalogTableShell>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {specialists.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2">
          {editId === s.id ? (
            <Input
              className="h-8 min-w-[8rem] flex-1"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          ) : (
            <span className={!s.isActive ? "text-muted-foreground line-through" : undefined}>
              {s.fullName}
              {!s.isActive ? " — выкл." : ""}
            </span>
          )}
          <RowActions
            isPending={isPending}
            editing={editId === s.id}
            isActive={s.isActive}
            onEdit={() => {
              setEditId(s.id);
              setEditName(s.fullName);
            }}
            onCancel={() => setEditId(null)}
            onSave={() =>
              void wrap(async () => {
                const res = await apiJson<{ ok: boolean }>(`${BASE}/specialists/${s.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fullName: editName }),
                });
                if (!res.ok) throw new Error("specialist_patch_failed");
                setEditId(null);
              })
            }
            onToggleActive={() =>
              void wrap(async () => {
                const res = s.isActive
                  ? await apiJson<{ ok: boolean }>(`${BASE}/specialists/${s.id}`, { method: "DELETE" })
                  : await apiJson<{ ok: boolean }>(`${BASE}/specialists/${s.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isActive: true }),
                    });
                if (!res.ok) throw new Error("specialist_toggle_failed");
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}

type ServiceRow = {
  id: string;
  title: string;
  durationMinutes: number;
  priceMinor: number;
  publicWidgetVisible: boolean;
  adminManualOnly: boolean;
  isActive: boolean;
};

export function BookingEngineServiceList({
  services,
  isPending,
  onChanged,
  onError,
  layout = "list",
}: CatalogListProps & { services: ServiceRow[] }) {
  const wrap = useCatalogAction(onChanged, onError);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPrice, setEditPrice] = useState("");

  if (layout === "table") {
    return (
      <CatalogTableShell>
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Услуга</th>
            <th className="px-3 py-2 font-medium">Мин</th>
            <th className="px-3 py-2 font-medium">Цена</th>
            <th className="px-3 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {editId === s.id ? (
                  <Input className="h-8" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                ) : (
                  <span className={!s.isActive ? "text-muted-foreground line-through" : undefined}>
                    {s.title}
                    {!s.publicWidgetVisible ? " · скрыта" : ""}
                    {s.adminManualOnly ? " · вручную" : ""}
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
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                  />
                ) : (
                  `${(s.priceMinor / 100).toLocaleString("ru-RU")} ₽`
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {editId !== s.id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={isPending}
                    onClick={() =>
                      void wrap(async () => {
                        const res = await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ adminManualOnly: !s.adminManualOnly }),
                        });
                        if (!res.ok) throw new Error("service_patch_failed");
                      })
                    }
                  >
                    {s.adminManualOnly ? "В виджет" : "Только вручную"}
                  </Button>
                ) : null}
                <RowActions
                  isPending={isPending}
                  editing={editId === s.id}
                  isActive={s.isActive}
                  onEdit={() => {
                    setEditId(s.id);
                    setEditTitle(s.title);
                    setEditDuration(String(s.durationMinutes));
                    setEditPrice(minorToRublesInput(s.priceMinor));
                  }}
                  onCancel={() => setEditId(null)}
                  onSave={() =>
                    void wrap(async () => {
                      const res = await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: editTitle,
                          durationMinutes: Number(editDuration),
                          priceMinor: rublesToMinor(parseRublesInput(editPrice)),
                        }),
                      });
                      if (!res.ok) throw new Error("service_patch_failed");
                      setEditId(null);
                    })
                  }
                  onToggleActive={() =>
                    void wrap(async () => {
                      const res = s.isActive
                        ? await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, { method: "DELETE" })
                        : await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: true }),
                          });
                      if (!res.ok) throw new Error("service_toggle_failed");
                    })
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </CatalogTableShell>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {services.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2">
          {editId === s.id ? (
            <>
              <Input
                className="h-8 min-w-[8rem] flex-1"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <Input
                className="h-8 w-16"
                type="number"
                value={editDuration}
                onChange={(e) => setEditDuration(e.target.value)}
              />
              <Input
                className="h-8 w-24"
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
              />
            </>
          ) : (
            <span className={!s.isActive ? "text-muted-foreground line-through" : undefined}>
              {s.title}, {s.durationMinutes} мин, {(s.priceMinor / 100).toLocaleString("ru-RU")} ₽
              {!s.publicWidgetVisible ? " · скрыта" : ""}
              {s.adminManualOnly ? " · вручную" : ""}
              {!s.isActive ? " · выкл." : ""}
            </span>
          )}
          {editId !== s.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={isPending}
              onClick={() =>
                void wrap(async () => {
                  const res = await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ adminManualOnly: !s.adminManualOnly }),
                  });
                  if (!res.ok) throw new Error("service_patch_failed");
                })
              }
            >
              {s.adminManualOnly ? "В виджет" : "Только вручную"}
            </Button>
          ) : null}
          <RowActions
            isPending={isPending}
            editing={editId === s.id}
            isActive={s.isActive}
            onEdit={() => {
              setEditId(s.id);
              setEditTitle(s.title);
              setEditDuration(String(s.durationMinutes));
              setEditPrice(minorToRublesInput(s.priceMinor));
            }}
            onCancel={() => setEditId(null)}
            onSave={() =>
              void wrap(async () => {
                const res = await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: editTitle,
                    durationMinutes: Number(editDuration),
                    priceMinor: rublesToMinor(parseRublesInput(editPrice)),
                  }),
                });
                if (!res.ok) throw new Error("service_patch_failed");
                setEditId(null);
              })
            }
            onToggleActive={() =>
              void wrap(async () => {
                const res = s.isActive
                  ? await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, { method: "DELETE" })
                  : await apiJson<{ ok: boolean }>(`${BASE}/services/${s.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isActive: true }),
                    });
                if (!res.ok) throw new Error("service_toggle_failed");
              })
            }
          />
        </li>
      ))}
    </ul>
  );
}
