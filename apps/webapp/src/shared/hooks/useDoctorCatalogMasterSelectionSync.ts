import { type Dispatch, type SetStateAction, useEffect } from "react";

type WithId = { id: string };

/**
 * Общее поведение doctor CMS master-detail при смене отфильтрованного списка:
 * при пустом списке сбрасывает выбор (и опционально мобильный «sheet»),
 * иначе сохраняет текущий id если он ещё в списке, иначе выбирает первый элемент;
 * для sheet обновляет объект строки если он ещё в списке.
 */
export function useDoctorCatalogMasterSelectionSync<T extends WithId>(params: {
  displayList: T[];
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  /** Синхронизация выбранной строки для мобильного вида (опционально). */
  setMobileItem?: Dispatch<SetStateAction<T | null>>;
  /** Не менять выбор (например режим «создание нового»). */
  suspend?: boolean;
  /** Если false — при отсутствии валидного выбора не подставлять первый элемент автоматически. */
  fallbackToFirst?: boolean;
}) {
  const { displayList, setSelectedId, setMobileItem, suspend, fallbackToFirst = true } = params;

  useEffect(() => {
    queueMicrotask(() => {
      if (suspend) return;
      if (displayList.length === 0) {
        setSelectedId(null);
        setMobileItem?.(null);
        return;
      }
      setSelectedId((cur) => {
        if (cur != null && displayList.some((x) => x.id === cur)) return cur;
        return fallbackToFirst ? displayList[0]!.id : null;
      });
      setMobileItem?.((prev) => {
        if (prev == null) return prev;
        const next = displayList.find((x) => x.id === prev.id);
        return next ?? null;
      });
    });
  }, [displayList, suspend, fallbackToFirst, setSelectedId, setMobileItem]);
}
