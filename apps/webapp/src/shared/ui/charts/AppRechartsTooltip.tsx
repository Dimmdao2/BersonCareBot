"use client";

import type { ComponentProps } from "react";
import { Tooltip } from "recharts";

export const appRechartsTooltipContentStyle: NonNullable<ComponentProps<typeof Tooltip>["contentStyle"]> = {
  background: "#ffffff",
  border: "1px solid hsl(var(--border))",
  borderRadius: "6px",
  fontSize: 11,
};

export function AppRechartsTooltip(props: ComponentProps<typeof Tooltip>) {
  const { contentStyle, ...rest } = props;
  return (
    <Tooltip
      {...rest}
      contentStyle={{
        ...appRechartsTooltipContentStyle,
        ...(contentStyle ?? {}),
      }}
    />
  );
}
