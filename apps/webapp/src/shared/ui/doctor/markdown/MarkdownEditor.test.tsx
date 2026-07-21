/** @vitest-environment jsdom */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor";
import { createMarkdownEditorExtensions } from "./markdownEditorExtensions";

const emptyRectList = [] as unknown as DOMRectList;

Object.defineProperties(HTMLElement.prototype, {
  getClientRects: { configurable: true, value: () => emptyRectList },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
});
Object.defineProperties(Range.prototype, {
  getClientRects: { configurable: true, value: () => emptyRectList },
  getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
});
Object.defineProperty(document, "elementFromPoint", {
  configurable: true,
  value: () => document.querySelector(".ProseMirror"),
});

vi.mock("./MediaLibraryInsertDialog", () => ({
  MediaLibraryInsertDialog: ({
    onInsert,
    disabled,
  }: {
    onInsert: (url: string, filename: string, meta?: { kind?: string; mimeType?: string }) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onInsert("/api/media/11111111-1111-4111-8111-111111111111", "photo.png", { kind: "image" })}
    >
      Библиотека или загрузка
    </button>
  ),
}));

function roundtrip(markdown: string): string {
  const editor = new Editor({
    extensions: createMarkdownEditorExtensions(),
    content: markdown,
    contentType: "markdown",
  });
  const result = editor.getMarkdown();
  editor.destroy();
  return result;
}

async function findEditor(container: HTMLElement): Promise<HTMLElement> {
  await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull());
  const editor = container.querySelector<HTMLElement>(".ProseMirror");
  if (!editor) throw new Error("Tiptap editor did not mount");
  expect(editor).toHaveAttribute("aria-label", "Редактор");
  return editor;
}

function placeCaretAtEnd(element: HTMLElement): void {
  element.focus();
  const selection = window.getSelection();
  if (!selection) throw new Error("Selection API is unavailable");
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

function selectLastCharacter(element: HTMLElement): void {
  element.focus();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let lastTextNode: Text | null = null;
  while (walker.nextNode()) lastTextNode = walker.currentNode as Text;
  if (!lastTextNode || lastTextNode.data.length === 0) {
    throw new Error("Editor has no text to select");
  }
  const selection = window.getSelection();
  if (!selection) throw new Error("Selection API is unavailable");
  const range = document.createRange();
  range.setStart(lastTextNode, lastTextNode.data.length - 1);
  range.setEnd(lastTextNode, lastTextNode.data.length);
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event("selectionchange"));
}

describe("MarkdownEditor", () => {
  it("keeps the representative GFM fixture stable without losing links or media", () => {
    const fixture = [
      "# Заголовок",
      "",
      "Текст с **жирным**, _курсивом_, ~~зачёркнутым~~ и `кодом`.",
      "",
      "- пункт",
      "- второй пункт",
      "",
      "1. первый",
      "2. второй",
      "",
      "- [x] готово",
      "- [ ] не готово",
      "",
      "| Колонка | Значение |",
      "| --- | --- |",
      "| A | B |",
      "",
      "[Файл](/api/media/11111111-1111-4111-8111-111111111111)",
      "",
      "![Фото](/api/media/22222222-2222-4222-8222-222222222222)",
      "",
      "[YouTube](https://www.youtube.com/watch?v=testVid)",
      "",
      "[Rutube](https://rutube.ru/video/rutubeClip/)",
      "",
      "Первая строка  ",
      "вторая строка",
    ].join("\n");

    const once = roundtrip(fixture);
    const twice = roundtrip(once);

    expect(twice).toBe(once);
    expect(once).toContain("# Заголовок");
    expect(once).toContain("**жирным**");
    expect(once).toContain("~~зачёркнутым~~");
    expect(once).toContain("| Колонка | Значение |");
    expect(once).toContain("- [x] готово");
    expect(once).toContain("/api/media/11111111-1111-4111-8111-111111111111");
    expect(once).toContain("/api/media/22222222-2222-4222-8222-222222222222");
    expect(once).toContain("https://www.youtube.com/watch?v=testVid");
    expect(once).toContain("https://rutube.ru/video/rutubeClip/");
    expect(once).toMatch(/Первая строка(?: {2}|\\)\nвторая строка/);
  });

  it("serializes edits into the hidden form field and onChange", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<MarkdownEditor name="body_md" defaultValue="" onChange={onChange} />);
    const textbox = await findEditor(container);

    await user.click(textbox);
    await user.type(textbox, "Новый текст");

    await waitFor(() => expect(container.querySelector('input[name="body_md"]')).toHaveValue("Новый текст"));
    expect(onChange).toHaveBeenLastCalledWith("Новый текст");
  });

  it("inserts media through the existing media-library control", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarkdownEditor name="body_md" defaultValue="Текст" />);
    await findEditor(container);
    await user.click(screen.getByRole("button", { name: /Библиотека или загрузка/i }));

    await waitFor(() => {
      const value = (container.querySelector('input[name="body_md"]') as HTMLInputElement | null)?.value ?? "";
      expect(value).toContain("Текст");
      expect(value).toContain("![photo.png](/api/media/11111111-1111-4111-8111-111111111111)");
    });
  });

  it("rejects edits whose serialized markdown exceeds maxLength", async () => {
    const user = userEvent.setup();
    const { container } = render(<MarkdownEditor name="body_md" defaultValue="12345" maxLength={5} />);
    const textbox = await findEditor(container);

    await user.click(textbox);
    await user.type(textbox, "6");

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Достигнут предел"));
    expect(container.querySelector('input[name="body_md"]')).toHaveValue("12345");
  });

  it("allows an over-limit initial value to shrink but rejects equal or increasing edits", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownEditor name="body_md" defaultValue="1234567" maxLength={5} />,
    );
    const textbox = await findEditor(container);

    placeCaretAtEnd(textbox);
    await user.keyboard("{Backspace}");
    await waitFor(() =>
      expect(container.querySelector('input[name="body_md"]')).toHaveValue("123456"),
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Достигнут предел");

    selectLastCharacter(textbox);
    await user.keyboard("X");
    await waitFor(() =>
      expect(container.querySelector('input[name="body_md"]')).toHaveValue("123456"),
    );

    placeCaretAtEnd(textbox);
    await user.keyboard("7");
    await waitFor(() =>
      expect(container.querySelector('input[name="body_md"]')).toHaveValue("123456"),
    );

    placeCaretAtEnd(textbox);
    await user.keyboard("{Backspace}");
    await waitFor(() => expect(container.querySelector('input[name="body_md"]')).toHaveValue("12345"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    placeCaretAtEnd(textbox);
    await user.keyboard("6");
    await waitFor(() => expect(container.querySelector('input[name="body_md"]')).toHaveValue("12345"));
    expect(screen.getByRole("alert")).toHaveTextContent("Достигнут предел");
  });

  it("allows a controlled over-limit value to be reduced progressively", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <MarkdownEditor name="body_md" value="abcdefg" maxLength={5} onChange={onChange} />,
    );
    const textbox = await findEditor(container);

    placeCaretAtEnd(textbox);
    await user.keyboard("{Backspace}");

    await waitFor(() =>
      expect(container.querySelector('input[name="body_md"]')).toHaveValue("abcdef"),
    );
    expect(onChange).toHaveBeenLastCalledWith("abcdef");
  });

  it("accepts an external controlled value without emitting a local change", async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <MarkdownEditor name="body_md" value="Первое" onChange={onChange} />,
    );
    await findEditor(container);

    await act(async () => {
      rerender(<MarkdownEditor name="body_md" value="Второе" onChange={onChange} />);
    });

    await waitFor(() => expect(container.querySelector('input[name="body_md"]')).toHaveValue("Второе"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
