"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { QuestionBuilderFields } from "./FeedbackQuestionBuilder";
import { QUESTION_TYPES } from "./questionTypes";

type FeedbackQuestionRow = {
  id: string;
  prompt: string;
  help_text: string | null;
  question_type:
    | "short_text"
    | "long_text"
    | "single_choice"
    | "multi_choice"
    | "rating"
    | "yes_no";
  options: string[] | null;
  required: boolean;
  sort_order: number;
  created_at: string;
};

type ApiQuestionResponse = {
  ok?: boolean;
  question?: FeedbackQuestionRow;
  error?: string;
};

function questionTypeLabel(value: string) {
  return QUESTION_TYPES.find((item) => item.value === value)?.label ?? value;
}

function optionsFromText(value: string) {
  return value
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);
}

function payloadFromForm(form: HTMLFormElement, extra?: Record<string, unknown>) {
  const data = new FormData(form);
  const optionsText = String(data.get("options_text") ?? "");

  return {
    ...extra,
    prompt: String(data.get("prompt") ?? "").trim(),
    helpText: String(data.get("help_text") ?? "").trim(),
    questionType: String(data.get("question_type") ?? "").trim(),
    optionsText,
    options: optionsFromText(optionsText),
    required: data.get("required") === "on",
    sortOrder: Number(data.get("sort_order") ?? 0),
  };
}

async function readQuestionResponse(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiQuestionResponse;

  if (!response.ok) {
    throw new Error(body.error || "The question could not be saved.");
  }

  return body;
}

function sortQuestions(questions: FeedbackQuestionRow[]) {
  return [...questions].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.created_at.localeCompare(b.created_at);
  });
}

export default function FeedbackQuestionManager({
  formId,
  initialQuestions,
}: {
  formId: string;
  initialQuestions: FeedbackQuestionRow[];
}) {
  const addFormRef = useRef<HTMLFormElement>(null);
  const [questions, setQuestions] = useState(() => sortQuestions(initialQuestions));
  const [addResetSignal, setAddResetSignal] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const sortedQuestions = useMemo(() => sortQuestions(questions), [questions]);
  const nextSortOrder =
    sortedQuestions.length === 0
      ? 1
      : Math.max(...sortedQuestions.map((question) => question.sort_order)) + 1;

  async function addQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setMessage(null);
    setSavingId("new");

    try {
      const response = await fetch("/api/admin/feedback/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          payloadFromForm(event.currentTarget, {
            formId,
          })
        ),
      });
      const body = await readQuestionResponse(response);

      if (!body.question) {
        throw new Error("The server did not return the new question.");
      }

      const updatedQuestions = sortQuestions([...sortedQuestions, body.question]);
      const nextOrder =
        Math.max(...updatedQuestions.map((question) => question.sort_order)) + 1;

      setQuestions(updatedQuestions);
      setMessage("Question added.");
      form.reset();
      const orderInput = form.querySelector<HTMLInputElement>('input[name="sort_order"]');
      if (orderInput) {
        orderInput.value = String(nextOrder);
      }
      setAddResetSignal((current) => current + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add question.");
    } finally {
      setSavingId(null);
    }
  }

  async function updateQuestion(
    event: FormEvent<HTMLFormElement>,
    questionId: string
  ) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSavingId(questionId);

    try {
      const response = await fetch(`/api/admin/feedback/questions/${questionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadFromForm(event.currentTarget)),
      });
      const body = await readQuestionResponse(response);

      if (!body.question) {
        throw new Error("The server did not return the saved question.");
      }

      setQuestions((current) =>
        sortQuestions(
          current.map((question) =>
            question.id === questionId ? body.question! : question
          )
        )
      );
      setMessage("Question saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save question.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteQuestion(question: FeedbackQuestionRow) {
    if (!window.confirm(`Delete "${question.prompt}"?`)) {
      return;
    }

    setError(null);
    setMessage(null);
    setSavingId(question.id);

    try {
      const response = await fetch(`/api/admin/feedback/questions/${question.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "delete" }),
      });
      await readQuestionResponse(response);

      setQuestions((current) =>
        current.filter((item) => item.id !== question.id)
      );
      setMessage("Question deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete question.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="min-h-12">
        {(message || error) && (
          <div
            className={`rounded-2xl border p-4 text-sm font-medium shadow-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {error || message}
          </div>
        )}
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Add question</h2>
        <form ref={addFormRef} onSubmit={addQuestion} className="space-y-3">
          <QuestionBuilderFields
            key={addResetSignal}
            defaultSortOrder={nextSortOrder}
          />
          <div className="flex justify-end">
            <button
              disabled={savingId === "new"}
              className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingId === "new" ? "Adding..." : "Add question"}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Current questions</h2>
        {sortedQuestions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 text-sm text-[var(--muted)]">
            No questions yet. Add at least one before sharing the public feedback
            link.
          </div>
        ) : (
          sortedQuestions.map((question) => (
            <form
              key={question.id}
              onSubmit={(event) => updateQuestion(event, question.id)}
              className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{question.prompt}</h3>
                  <p className="text-xs text-[var(--muted)]">
                    {questionTypeLabel(question.question_type)}
                    {question.required ? " | Required" : " | Optional"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteQuestion(question)}
                  disabled={savingId === question.id}
                  className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete question
                </button>
              </div>

              <QuestionBuilderFields
                defaultPrompt={question.prompt}
                defaultHelpText={question.help_text ?? ""}
                defaultType={question.question_type}
                defaultOptions={question.options}
                defaultRequired={question.required}
                defaultSortOrder={question.sort_order}
              />

              <div className="flex justify-end">
                <button
                  disabled={savingId === question.id}
                  className="rounded-xl bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingId === question.id ? "Saving..." : "Save question"}
                </button>
              </div>
            </form>
          ))
        )}
      </section>
    </div>
  );
}
