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

type IntakeDetail = {
  id: string;
  type: "lfk" | "nutrition";
  status: string;
  patientName: string;
  patientPhone: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  attachmentUrls?: string[];
  attachmentFiles?: Array<{
    id: string;
    url: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  answers?: Array<{ questionId: string; questionText: string; value: string; ordinal: number }>;
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadDetail(id: string) {
    if (detailId === id && detail) {
      setDetailId(null);
      setDetail(null);
      return;
    }
    setDetailId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/doctor/online-intake/${id}`);
      if (!res.ok) {
        setDetail(null);
        setDetailId(null);
        return;
      }
      setDetail((await res.json()) as IntakeDetail);
    } finally {
      setDetailLoading(false);
    }
  }

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

            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="self-start h-8 px-2"
                onClick={() => void loadDetail(item.id)}
              >
                {detailId === item.id ? "Скрыть детали" : "Подробнее"}
              </Button>
              {detailId === item.id && detailLoading && (
                <p className="text-xs text-muted-foreground">Загрузка деталей…</p>
              )}
              {detailId === item.id && detail && detail.id === item.id && (
                <div className="rounded-md border border-border/80 bg-muted/30 p-3 text-sm space-y-2">
                  {detail.type === "lfk" && detail.description && (
                    <p className="whitespace-pre-wrap text-foreground">{detail.description}</p>
                  )}
                  {detail.type === "lfk" &&
                    (detail.attachmentUrls?.length || detail.attachmentFiles?.length) && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Вложения</p>
                        <ul className="list-disc pl-4 space-y-1">
                          {(detail.attachmentUrls ?? []).map((u) => (
                            <li key={u}>
                              <a
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline break-all"
                              >
                                {u}
                              </a>
                              <span className="text-muted-foreground text-xs ml-1">(ссылка)</span>
                            </li>
                          ))}
                          {(detail.attachmentFiles ?? []).map((f) => (
                            <li key={f.id}>
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline break-all"
                              >
                                {f.originalName}
                              </a>
                              <span className="text-muted-foreground text-xs ml-1">
                                ({f.mimeType}, {(f.sizeBytes / 1024).toFixed(1)} KB)
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  {detail.type === "nutrition" &&
                    detail.answers?.map((a) => (
                      <div key={a.questionId} className="space-y-0.5">
                        <p className="text-xs font-medium text-muted-foreground">{a.questionText}</p>
                        <p className="whitespace-pre-wrap">{a.value}</p>
                      </div>
                    ))}
                </div>
              )}
            </div>

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
