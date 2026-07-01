/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  REMINDER_DELIVERY_CHANNELS_NOTICE,
  ReminderDeliveryChannelsNotice,
} from "./ReminderDeliveryChannelsNotice";

describe("ReminderDeliveryChannelsNotice", () => {
  it("renders notice text and link to notification settings", () => {
    render(<ReminderDeliveryChannelsNotice />);
    expect(screen.getByText(REMINDER_DELIVERY_CHANNELS_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Настроить каналы доставки" })).toHaveAttribute(
      "href",
      "/app/patient/notifications/settings",
    );
  });
});
