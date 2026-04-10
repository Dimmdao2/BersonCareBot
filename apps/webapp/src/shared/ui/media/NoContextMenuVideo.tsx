"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";

/**
 * Видео без контекстного меню по ПКМ (сохранить кадр / и т.п.).
 * Не защита от скачивания — только снижение удобства.
 */
export const NoContextMenuVideo = forwardRef<HTMLVideoElement, ComponentPropsWithoutRef<"video">>(
  function NoContextMenuVideo({ onContextMenu, ...rest }, ref) {
    return (
      <video
        ref={ref}
        {...rest}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e);
        }}
      />
    );
  },
);
