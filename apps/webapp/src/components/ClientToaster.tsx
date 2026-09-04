'use client';

import { Toaster } from 'react-hot-toast';

/**
 * Единственный канал результатов действий: успех и операционный отказ любого кабинета
 * (врач, пациент, админ) всплывают здесь сверху и сами гаснут. Формы и модалки не держат
 * собственных строк «Сохранено» — иначе результат остаётся на закрытом экране.
 * Валидация поля и состояния загрузки сюда не попадают: они живут у своего поля.
 */
export function ClientToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3000,
        success: {
          className: '!border !border-emerald-600/35 !bg-emerald-50 !text-emerald-900',
          iconTheme: { primary: '#16a34a', secondary: '#ecfdf3' },
        },
        error: {
          className: '!border !border-destructive/35 !bg-destructive/10 !text-destructive',
        },
      }}
    />
  );
}
