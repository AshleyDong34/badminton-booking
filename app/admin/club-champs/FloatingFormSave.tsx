"use client";

import { useEffect, useMemo, useState } from "react";

type FloatingFormSaveProps = {
  formId: string;
  label: string;
};

function changedInputCount(form: HTMLFormElement) {
  const inputs = Array.from(
    form.querySelectorAll<HTMLInputElement>("input[data-track-save='1']")
  );
  let changed = 0;
  for (const input of inputs) {
    if (input.disabled) continue;
    const current = input.value.trim();
    const initial = input.defaultValue.trim();
    if (current !== initial) changed += 1;
  }
  return changed;
}

export default function FloatingFormSave({ formId, label }: FloatingFormSaveProps) {
  const [dirtyCount, setDirtyCount] = useState(0);
  const [inView, setInView] = useState(true);
  const visibilityClass = useMemo(
    () => (dirtyCount > 0 && inView ? "opacity-100" : "pointer-events-none opacity-0"),
    [dirtyCount, inView]
  );

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    const refresh = () => setDirtyCount(changedInputCount(form));
    refresh();

    const onInput = () => refresh();
    form.addEventListener("input", onInput, true);
    form.addEventListener("change", onInput, true);

    // Keep the dirty count in sync after fetch-save rerenders that replace inputs/defaults.
    const mutationObserver = new MutationObserver(() => refresh());
    mutationObserver.observe(form, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["value", "disabled", "data-track-save"],
    });

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.05 }
    );
    observer.observe(form);

    return () => {
      form.removeEventListener("input", onInput, true);
      form.removeEventListener("change", onInput, true);
      mutationObserver.disconnect();
      observer.disconnect();
    };
  }, [formId]);

  return (
    <div
      className={`fixed bottom-3 right-3 z-40 transition-opacity duration-150 sm:bottom-4 sm:right-4 ${visibilityClass}`}
      aria-hidden={dirtyCount === 0 || !inView}
    >
      <button
        type="submit"
        form={formId}
        className="rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-900 shadow-lg hover:bg-amber-200"
      >
        {label} ({dirtyCount})
      </button>
    </div>
  );
}
