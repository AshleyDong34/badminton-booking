"use client";

import { useRef, useState } from "react";

type EventImageInputProps = {
  defaultUrl?: string | null;
  defaultAlt?: string | null;
  showRemoveOption?: boolean;
};

export default function EventImageInput({
  defaultUrl,
  defaultAlt,
  showRemoveOption = false,
}: EventImageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState(defaultUrl ?? "");
  const [pasteHint, setPasteHint] = useState("Click to upload, paste an image, or use a URL.");

  function setFile(file: File) {
    const input = fileInputRef.current;
    if (!input) return;

    const files = new DataTransfer();
    files.items.add(file);
    input.files = files.files;

    setPreviewUrl(URL.createObjectURL(file));
    setPasteHint(file.name || "Image ready to upload.");
  }

  function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find((item) =>
      item.type.startsWith("image/")
    );
    if (!file) {
      setPasteHint("No image found in clipboard.");
      return;
    }
    event.preventDefault();
    setFile(file);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">Image (optional)</label>
          <div
            role="button"
            tabIndex={0}
            onPaste={handlePaste}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="mt-1 flex min-h-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-[var(--line)] bg-[var(--chip)] p-3 text-center text-sm text-[var(--muted)]"
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={defaultAlt ?? ""}
                className="max-h-48 w-full rounded-lg object-cover"
              />
            ) : (
              <span>{pasteHint} Leave this empty for a text-only event.</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            name="image_file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setFile(file);
            }}
          />
          <p className="mt-1 text-xs text-[var(--muted)]">{pasteHint}</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Image URL</label>
            <input
              name="image_url"
              type="url"
              defaultValue={defaultUrl ?? ""}
              onChange={(event) => setPreviewUrl(event.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
              placeholder="Optional https://..."
            />
            <p className="mt-1 text-xs text-[var(--muted)]">
              Useful if the image is already hosted somewhere.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium">Image description</label>
            <input
              name="image_alt"
              type="text"
              defaultValue={defaultAlt ?? ""}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2"
              placeholder="Optional"
            />
          </div>

          {showRemoveOption && defaultUrl && (
            <label className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm">
              <input name="remove_image" type="checkbox" className="h-4 w-4" />
              Remove current image
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
