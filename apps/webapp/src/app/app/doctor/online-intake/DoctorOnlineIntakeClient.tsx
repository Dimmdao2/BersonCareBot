"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { cn } from "@/lib/utils";
import { DoctorEmptyState } from "@/shared/ui/doctor/DoctorEmptyState";
import { doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { doctorClientProfileHref } from "../clients/doctorClientProfileHref";

type IntakeItem = {
  id: string;
  patientUserId: string;
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
  patientUserId: string;
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

function IntakeDetailBody({ detail }: { detail: IntakeDetail }) {
  return (
    <div className="rounded-md border border-border/80 bg-muted/30 p-3 text-sm space-y-2">
      {detail.type === "lfk" && detail.description && (
        <p className="whitespace-pre-wrap text-foreground">{detail.description}</p>
      )}
      {detail.type === "lfk" && (detail.attachmentUrls?.length || detail.attachmentFiles?.length) && (
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
  );
}

function IntakeCardActions({
  patientUserId,
  status,
  updating,
  onClose,
}: {
  patientUserId: string;
  status: string;
  updating: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Link
        href={doctorClientProfileHref(patientUserId, { profileListScope: "appointments" })}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
      >
        Карточка клиента
      </Link>
      <Link
        href={doctorClientProfileHref(patientUserId, {
          profileListScope: "appointments",
          openChat: true,
        })}
        className={cn(buttonVariants({ size: "sm" }))}
      >
        Чат
      </Link>
      {status !== "closed" ? (
        <Button size="sm" variant="outline" disabled={updating} onClick={onClose}>
          Закрыть
        </Button>
      ) : null}
    </div>
  );
}

export type DoctorOnlineIntakeClientProps = {
  /** Открыть карточку по id (deep-link `/app/doctor/online-intake/[requestId]`). */
  initialOpenRequestId?: string | null;
  /** Вызывается при открытии/закрытии карточки заявки. null — карточка закрыта. */
  onDetailChange?: (id: string | null) => void;
};

export function DoctorOnlineIntakeClient({ initialOpenRequestId = null, onDetailChange }: DoctorOnlineIntakeClientProps) {
  const [items, setItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntakeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deepLinkError, setDeepLinkError] = useState<"not_found" | "forbidden" | "error" | null>(null);

  const refreshDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/doctor/online-intake/${id}`);
      if (res.ok) {
        setDetail((await res.json()) as IntakeDetail);
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function loadDetail(id: string) {
    if (detailId === id && detail) {
      setDetailId(null);
      setDetail(null);
      onDetailChange?.(null);
      return;
    }
    setDetailId(id);
    onDetailChange?.(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/doctor/online-intake/${id}`);
      if (!res.ok) {
        setDetail(null);
        setDetailId(null);
        onDetailChange?.(null);
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
      const params = filter === "open" ? "?open=1" : "";
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

  useEffect(() => {
    const id = initialOpenRequestId?.trim();
    if (!id) return;

    let cancelled = false;
    setDeepLinkError(null);
    setDetailId(id);
    setDetailLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/api/doctor/online-intake/${id}`);
        if (cancelled) return;
        if (res.status === 404) {
          setDeepLinkError("not_found");
          setDetail(null);
          setDetailId(null);
          return;
        }
        if (res.status === 403) {
          setDeepLinkError("forbidden");
          setDetail(null);
          setDetailId(null);
          return;
        }
        if (!res.ok) {
          setDeepLinkError("error");
          setDetail(null);
          setDetailId(null);
          return;
        }
        const loaded = (await res.json()) as IntakeDetail;
        setDetail(loaded);
        if (loaded.status === "closed") {
          setFilter("all");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialOpenRequestId]);

  async function closeRequest(id: string) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/doctor/online-intake/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (res.ok) {
        await loadItems();
        if (detailId === id) {
          if (filter === "open") {
            setDetailId(null);
            setDetail(null);
          } else {
            await refreshDetail(id);
          }
        }
      }
    } finally {
      setUpdatingId(null);
    }
  }

  const showOrphanDetail =
    Boolean(detail && detailId && !items.some((i) => i.id === detailId)) &&
    detail?.status !== "closed";

  return (
    <div className="flex flex-col gap-3">
      {deepLinkError === "not_found" && (
        <p className="text-sm text-destructive" role="alert">
          Заявка не найдена или недоступна.
        </p>
      )}
      {deepLinkError === "forbidden" && (
        <p className="text-sm text-destructive" role="alert">
          Нет доступа к этой заявке.
        </p>
      )}
      {deepLinkError === "error" && (
        <p className="text-sm text-destructive" role="alert">
          Не удалось загрузить заявку. Попробуйте позже.
        </p>
      )}

      {showOrphanDetail && detail && detailId && (
        <div className="rounded-lg border border-primary/30 bg-card p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">Заявка по ссылке</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{detail.patientName}</span>
            <span className="text-xs text-muted-foreground">{detail.patientPhone}</span>
            <Badge variant="outline">{TYPE_LABELS[detail.type] ?? detail.type}</Badge>
            <Badge variant={STATUS_VARIANTS[detail.status] ?? "outline"}>
              {STATUS_LABELS[detail.status] ?? detail.status}
            </Badge>
          </div>
          {detailLoading && <p className="text-xs text-muted-foreground">Обновление…</p>}
          {!detailLoading && <IntakeDetailBody detail={detail} />}
          {detail.patientUserId ? (
            <IntakeCardActions
              patientUserId={detail.patientUserId}
              status={detail.status}
              updating={updatingId === detail.id}
              onClose={() => void closeRequest(detail.id)}
            />
          ) : null}
        </div>
      )}

      <div className="flex gap-2">
        {(["open", "all"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {f === "open" ? "Открытые" : "Все"}
          </Button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Загрузка...</p>}

      {!loading && items.length === 0 && !showOrphanDetail && (
        <DoctorEmptyState>
          <p>{filter === "open" ? "Открытых заявок нет" : "Заявок нет"}</p>
        </DoctorEmptyState>
      )}

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(doctorSectionItemClass, "flex flex-col gap-2")}
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
                <IntakeDetailBody detail={detail} />
              )}
            </div>

            {item.patientUserId ? (
              <IntakeCardActions
                patientUserId={item.patientUserId}
                status={item.status}
                updating={updatingId === item.id}
                onClose={() => void closeRequest(item.id)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
