"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type IntakeItem = {
  id: string;
  type: "lfk" | "nutrition";
  status: string;
  summary: string | null;
  patientName: string;
  patientPhone: string;
  createdAt: string;
  updatedAt: string;
};

type IntakeListResponse = {
  items: IntakeItem[];
  total: number;
  page: number;
  totalPages: number;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  in_review: "На рассмотрении",
  contacted: "Связались",
  closed: "Закрыта",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  in_review: "secondary",
  contacted: "secondary",
  closed: "outline",
};

const TYPE_LABELS: Record<string, string> = {
  lfk: "ЛФК",
  nutrition: "Нутрициология",
};

export function DoctorOnlineIntakeClient() {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "in_review">("new");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadItems() {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/doctor/online-intake${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as IntakeListResponse;
      setItems(data.items);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function changeStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/doctor/online-intake/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        await loadItems();
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(["new", "in_review", "all"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "new" ? "Новые" : f === "in_review" ? "На рассмотрении" : "Все"}
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Заявок нет</p>
      )}

      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{item.patientName}</span>
              <span className="text-xs text-muted-foreground">{item.patientPhone}</span>
              <Badge variant="outline">{TYPE_LABELS[item.type] ?? item.type}</Badge>
              <Badge variant={STATUS_VARIANTS[item.status] ?? "outline"}>
                {STATUS_LABELS[item.status] ?? item.status}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString("ru-RU")}
              </span>
            </div>

            {item.summary && (
              <p className="text-sm text-muted-foreground line-clamp-2">{item.summary}</p>
            )}

            <div className="flex gap-2 flex-wrap">
              {item.status === "new" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingId === item.id}
                  onClick={() => changeStatus(item.id, "in_review")}
                >
                  На рассмотрение
                </Button>
              )}
              {(item.status === "new" || item.status === "in_review") && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingId === item.id}
                  onClick={() => changeStatus(item.id, "contacted")}
                >
                  Связались
                </Button>
              )}
              {item.status !== "closed" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingId === item.id}
                  onClick={() => changeStatus(item.id, "closed")}
                >
                  Закрыть
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
