/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InternationalPhoneInput } from "./InternationalPhoneInput";

describe("InternationalPhoneInput", () => {
  it("disables submit until the number is valid E.164", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InternationalPhoneInput onSubmit={onSubmit} submitLabel="Продолжить" />);

    const btn = screen.getByRole("button", { name: "Продолжить" });
    expect(btn).toBeDisabled();

    const input = screen.getByLabelText("Номер телефона");
    await user.click(input);
    // RU по умолчанию: достаточно 10 цифр мобильного без +7
    await user.type(input, "9991234567");
    expect(btn).not.toBeDisabled();

    await user.click(btn);
    expect(onSubmit).toHaveBeenCalledWith("+79991234567");
  });
});
