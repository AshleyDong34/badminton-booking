"use client";

import { useMemo, useState } from "react";
import { QUESTION_TYPES, type FeedbackQuestionType } from "./questionTypes";

function normaliseType(value: string): FeedbackQuestionType {
  if (
    value === "short_text" ||
    value === "long_text" ||
    value === "single_choice" ||
    value === "multi_choice" ||
    value === "rating" ||
    value === "yes_no"
  ) {
    return value;
  }
  return "long_text";
}

function normaliseOptions(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function optionsToText(value: unknown) {
  return normaliseOptions(value).join("\n");
}

function typeMeta(type: FeedbackQuestionType) {
  return QUESTION_TYPES.find((item) => item.value === type) ?? QUESTION_TYPES[1];
}

function OptionPreview({ options }: { options: string[] }) {
  if (options.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)]">
        Add at least two options, one per line.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <span
          key={option}
          className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-semibold text-[var(--muted)]"
        >
          {option}
        </span>
      ))}
    </div>
  );
}

export function QuestionTypePreview({
  type,
  options,
}: {
  type: string;
  options?: unknown;
}) {
  const normalisedType = normaliseType(type);
  const normalisedOptions = normaliseOptions(options);

  if (normalisedType === "short_text") {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-3">
        <div className="h-9 rounded-lg border border-dashed border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs text-[var(--muted)]">
          Short answer input
        </div>
      </div>
    );
  }

  if (normalisedType === "long_text") {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-3">
        <div className="h-20 rounded-lg border border-dashed border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs text-[var(--muted)]">
          Long answer text box
        </div>
      </div>
    );
  }

  if (normalisedType === "single_choice") {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
        <p className="mb-2 text-xs font-semibold text-blue-800">
          Single choice options
        </p>
        <OptionPreview options={normalisedOptions} />
      </div>
    );
  }

  if (normalisedType === "multi_choice") {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-3">
        <p className="mb-2 text-xs font-semibold text-emerald-800">
          Multiple choice options
        </p>
        <OptionPreview options={normalisedOptions} />
      </div>
    );
  }

  if (normalisedType === "rating") {
    return (
      <div className="grid gap-2 rounded-xl border border-amber-100 bg-amber-50/70 p-3 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((rating) => (
          <span
            key={rating}
            className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-center text-sm font-bold text-amber-800"
          >
            {rating}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-xl border border-[var(--line)] bg-white p-3 sm:grid-cols-2">
      <span className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center text-sm font-bold text-green-800">
        Yes
      </span>
      <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-bold text-red-800">
        No
      </span>
    </div>
  );
}

export function QuestionBuilderFields({
  defaultPrompt = "",
  defaultHelpText = "",
  defaultType = "long_text",
  defaultOptions = [],
  defaultRequired = false,
  defaultSortOrder,
  fieldPrefix = "",
}: {
  defaultPrompt?: string;
  defaultHelpText?: string;
  defaultType?: string;
  defaultOptions?: unknown;
  defaultRequired?: boolean;
  defaultSortOrder: number;
  fieldPrefix?: string;
}) {
  const [questionType, setQuestionType] = useState<FeedbackQuestionType>(() =>
    normaliseType(defaultType)
  );
  const [optionsText, setOptionsText] = useState(() =>
    optionsToText(defaultOptions)
  );

  const meta = typeMeta(questionType);
  const choiceQuestion =
    questionType === "single_choice" || questionType === "multi_choice";
  const previewOptions = useMemo(() => normaliseOptions(optionsText), [optionsText]);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-[1fr_14rem_7rem]">
        <label className="block text-sm font-medium">
          Question
          <input
            name={`${fieldPrefix}prompt`}
            defaultValue={defaultPrompt}
            required
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
            placeholder="What should we ask?"
          />
        </label>
        <label className="block text-sm font-medium">
          Type
          <select
            name={`${fieldPrefix}question_type`}
            value={questionType}
            onChange={(event) => setQuestionType(normaliseType(event.target.value))}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
          >
            {QUESTION_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Order
          <input
            name={`${fieldPrefix}sort_order`}
            type="number"
            defaultValue={defaultSortOrder}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
          />
        </label>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--chip)] p-4">
        <p className="text-sm font-semibold">{meta.label}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{meta.hint}</p>
      </div>

      <label className="block text-sm font-medium">
        Help text
        <input
          name={`${fieldPrefix}help_text`}
          defaultValue={defaultHelpText}
          className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
          placeholder="Optional extra explanation"
        />
      </label>

      {choiceQuestion && (
        <label className="block text-sm font-medium">
          {questionType === "single_choice"
            ? "Single choice options"
            : "Multiple choice options"}
          <textarea
            name={`${fieldPrefix}options_text`}
            value={optionsText}
            onChange={(event) => setOptionsText(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm leading-6"
            placeholder={"Option 1\nOption 2\nOption 3"}
          />
          <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
            One option per line. Choice questions need at least two options.
          </span>
        </label>
      )}

      {!choiceQuestion && (
        <input type="hidden" name={`${fieldPrefix}options_text`} value="" />
      )}

      <QuestionTypePreview type={questionType} options={previewOptions} />

      <label className="flex items-center gap-2 text-sm">
        <input
          name={`${fieldPrefix}required`}
          type="checkbox"
          defaultChecked={defaultRequired}
        />
        Required question
      </label>
    </>
  );
}
