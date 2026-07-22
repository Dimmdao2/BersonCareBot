/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MessageComposer } from "./MessageComposer";

function ComposerHarness(props: {
  onSubmit: () => void;
  initialValue?: string;
  submitting?: boolean;
}) {
  const [value, setValue] = useState(props.initialValue ?? "");
  return (
    <MessageComposer
      value={value}
      onValueChange={setValue}
      onSubmit={props.onSubmit}
      submitting={props.submitting ?? false}
      placeholder="Сообщение"
      ariaLabel="Текст сообщения"
      submitLabel="Отправить"
      submittingLabel="Отправка..."
      renderTextarea={(textareaProps) => <textarea {...textareaProps} />}
      renderSubmit={(submitProps) => <button {...submitProps} />}
    />
  );
}

describe("MessageComposer", () => {
  it("uses trim validation and exposes the current loading state", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<ComposerHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: "Текст сообщения" });
    const send = screen.getByRole("button", { name: "Отправить" });

    expect(send).toBeDisabled();
    await userEvent.type(input, "   ");
    expect(send).toBeDisabled();
    await userEvent.type(input, "ответ");
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<ComposerHarness onSubmit={onSubmit} initialValue="ответ" submitting />);
    expect(screen.getByRole("button", { name: "Отправка..." })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Текст сообщения" })).toBeDisabled();
  });

  it("preserves native Enter and Shift+Enter newlines without sending", async () => {
    const onSubmit = vi.fn();
    render(<ComposerHarness onSubmit={onSubmit} />);
    const input = screen.getByRole("textbox", { name: "Текст сообщения" });

    await userEvent.type(input, "первая{Enter}вторая{Shift>}{Enter}{/Shift}третья");

    expect(input).toHaveValue("первая\nвторая\nтретья");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("supports a parity adapter whose existing empty-submit validation runs in the callback", async () => {
    const onSubmit = vi.fn();
    render(
      <MessageComposer
        value=""
        onValueChange={() => {}}
        onSubmit={onSubmit}
        submitting={false}
        disableSubmitWhenEmpty={false}
        placeholder="Ответ"
        ariaLabel="Ответ"
        submitLabel="Отправить"
        submittingLabel="Отправка..."
        secondaryActions={<button type="button">Отмена</button>}
        renderTextarea={(textareaProps) => <textarea {...textareaProps} />}
        renderSubmit={(submitProps) => <button {...submitProps} />}
        renderActions={(submit, secondaryActions) => (
          <footer>
            {secondaryActions}
            {submit}
          </footer>
        )}
      />,
    );

    const actions = screen.getByRole("contentinfo");
    expect(actions).toHaveTextContent("ОтменаОтправить");
    await userEvent.click(screen.getByRole("button", { name: "Отправить" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
