"use client";

import { useRef } from "react";

type NoticeboardTextEditorProps = {
  name: string;
  defaultValue: string;
  placeholder: string;
  rows?: number;
};

function cleanSelection(text: string, fallback: string) {
  return text.length > 0 ? text : fallback;
}

export function NoticeboardTextEditor({
  name,
  defaultValue,
  placeholder,
  rows = 7,
}: NoticeboardTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const replaceSelection = (
    makeText: (selected: string) => string,
    selectionMode: SelectionMode = "end"
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const nextText = makeText(selected);

    textarea.setRangeText(nextText, start, end, selectionMode);
    textarea.focus();
  };

  const wrapSelection = (before: string, after: string, fallback: string) => {
    replaceSelection((selected) => {
      const content = cleanSelection(selected, fallback);
      return `${before}${content}${after}`;
    });
  };

  const formatLines = (
    prefixLine: (line: string, index: number) => string,
    fallback: string
  ) => {
    replaceSelection((selected) => {
      const content = cleanSelection(selected, fallback);
      return content
        .split(/\r?\n/)
        .map((line, index) => prefixLine(line, index))
        .join("\n");
    });
  };

  return (
    <div className="mt-1 space-y-2">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-[var(--line)] bg-[var(--chip)] p-2">
        <button
          type="button"
          onClick={() => wrapSelection("**", "**", "bold text")}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5"
        >
          Bold
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("*", "*", "italic text")}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5"
        >
          Italic
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("[", "](https://example.com)", "link text")}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5"
        >
          Link
        </button>
        <button
          type="button"
          onClick={() =>
            formatLines(
              (line) => (line.trim() ? `- ${line.replace(/^[-*]\s+/, "")}` : line),
              "List item"
            )
          }
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5"
        >
          Bullet list
        </button>
        <button
          type="button"
          onClick={() =>
            formatLines(
              (line, index) =>
                line.trim()
                  ? `${index + 1}. ${line.replace(/^\d+[.)]\s+/, "")}`
                  : line,
              "List item"
            )
          }
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5"
        >
          Numbered list
        </button>
        <button
          type="button"
          onClick={() =>
            formatLines(
              (line) =>
                line.trim() ? `## ${line.replace(/^#{1,3}\s+/, "")}` : "## Heading",
              "Heading"
            )
          }
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold shadow-sm transition hover:-translate-y-0.5"
        >
          Heading
        </button>
      </div>

      <textarea
        ref={textareaRef}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}
