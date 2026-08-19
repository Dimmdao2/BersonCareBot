'use client';

/**
 * Граница ошибки визитки клиники. Существует ради ОДНОГО свойства: страница, которую не удалось
 * прочитать, отвечает кодом ошибки, а не 200 с вежливым текстом. Пустая или «временно
 * недоступная» карточка со статусом 200 — ложная запись о готовности: по ней перестают проверять.
 */
export default function ClinicCardError() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <h1 className="text-lg font-semibold">Страница клиники временно недоступна</h1>
      <p className="text-sm text-muted-foreground">
        Мы не смогли загрузить эту страницу. Попробуйте обновить её через несколько минут.
      </p>
    </main>
  );
}
