"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";

/**
 * Видео без контекстного меню по ПКМ (сохранить кадр / и т.п.).
 * Не защита от скачивания — только снижение удобства.
 * `onContextMenuCapture` — чтобы меню не всплывало с нативных контролов плеера там, где это поддерживается.
 */
export const NoContextMenuVideo = forwardRef<HTMLVideoElement, ComponentPropsWithoutRef<"video">>(
  function NoContextMenuVideo({ onContextMenu, onContextMenuCapture, ...rest }, ref) {
    return (
      <video
        ref={ref}
        {...rest}
        onContextMenuCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenuCapture?.(e);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu?.(e);
        }}
      />
    );
  },
);
