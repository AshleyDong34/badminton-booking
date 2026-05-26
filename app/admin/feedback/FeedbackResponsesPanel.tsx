"use client";

import { useMemo, useState } from "react";
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

type FeedbackResponseRow = {
  id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  is_anonymous: boolean;
  status: "new" | "read" | "archived";
  page_path: string | null;
  created_at: string;
};

type FeedbackAnswerRow = {
  id: string;
  response_id: string;
  question_id: string | null;
  question_prompt: string;
  question_type: string;
  answer_text: string | null;
  answer_json: unknown;
};

type StatusFilter = "all" | FeedbackResponseRow["status"];

function questionTypeLabel(value: string) {
  return QUESTION_TYPES.find((item) => item.value === value)?.label ?? value;
}

function responseName(response: FeedbackResponseRow) {
  if (response.is_anonymous) return "Anonymous";
  return response.respondent_name || response.respondent_email || "No name given";
}

function answerValues(answer: FeedbackAnswerRow) {
  if (answer.question_type === "multi_choice" && Array.isArray(answer.answer_json)) {
    return answer.answer_json.map((value) => String(value)).filter(Boolean);
  }
  return answer.answer_text ? [answer.answer_text] : ["(blank)"];
}

function answerText(answer: FeedbackAnswerRow) {
  return answerValues(answer).join(", ");
}

function statusClasses(status: FeedbackResponseRow["status"]) {
  if (status === "new") return "border-blue-200 bg-blue-50 text-blue-800";
  if (status === "archived") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-green-200 bg-green-50 text-green-800";
}

function matchesSearch(
  response: FeedbackResponseRow,
  answers: FeedbackAnswerRow[],
  query: string
) {
  if (!query) return true;
  const haystack = [
    responseName(response),
    response.respondent_email,
    response.status,
    response.page_path,
    new Date(response.created_at).toLocaleString("en-GB"),
    ...answers.flatMap((answer) => [answer.question_prompt, answerText(answer)]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default function FeedbackResponsesPanel({
  questions,
  responses,
  answers,
}: {
  questions: FeedbackQuestionRow[];
  responses: FeedbackResponseRow[];
  answers: FeedbackAnswerRow[];
}) {
  const [localResponses, setLocalResponses] = useState(responses);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const answersByResponse = useMemo(() => {
    const map = new Map<string, FeedbackAnswerRow[]>();
    for (const answer of answers) {
      const list = map.get(answer.response_id) ?? [];
      list.push(answer);
      map.set(answer.response_id, list);
    }
    return map;
  }, [answers]);

  const filteredResponses = useMemo(() => {
    const priority = { new: 0, read: 1, archived: 2 };

    return [...localResponses]
      .filter((response) =>
        statusFilter === "all" ? true : response.status === statusFilter
      )
      .filter((response) =>
        matchesSearch(response, answersByResponse.get(response.id) ?? [], query)
      )
      .sort((a, b) => {
        const priorityDiff = priority[a.status] - priority[b.status];
        if (priorityDiff !== 0) return priorityDiff;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  }, [answersByResponse, localResponses, query, statusFilter]);

  const groupedAnswers = useMemo(
    () =>
      questions.map((question) => {
        const questionAnswers = answers.filter(
          (answer) => answer.question_id === question.id
        );
        const counts = new Map<string, number>();

        for (const answer of questionAnswers) {
          for (const value of answerValues(answer)) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }

        return {
          question,
          total: questionAnswers.length,
          counts: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]),
          latest: questionAnswers
            .slice(-3)
            .reverse()
            .map((answer) => answerText(answer)),
        };
      }),
    [answers, questions]
  );

  async function updateResponse(
    response: FeedbackResponseRow,
    intent: "read" | "archive" | "delete"
  ) {
    if (intent === "delete" && !window.confirm("Delete this feedback response?")) {
      return;
    }

    setBusyId(response.id);
    setError(null);
    setMessage(null);

    try {
      const result = await fetch(`/api/admin/feedback/responses/${response.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const body = (await result.json().catch(() => ({}))) as {
        error?: string;
        status?: FeedbackResponseRow["status"];
      };

      if (!result.ok) {
        throw new Error(body.error || "Could not update feedback response.");
      }

      if (intent === "delete") {
        setLocalResponses((current) =>
          current.filter((item) => item.id !== response.id)
        );
        setMessage("Feedback response deleted.");
      } else if (body.status) {
        setLocalResponses((current) =>
          current.map((item) =>
            item.id === response.id ? { ...item, status: body.status! } : item
          )
        );
        setMessage("Feedback response updated.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update feedback response."
      );
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    all: localResponses.length,
    new: localResponses.filter((response) => response.status === "new").length,
    read: localResponses.filter((response) => response.status === "read").length,
    archived: localResponses.filter((response) => response.status === "archived")
      .length,
  };

  return (
    <section className="space-y-5 rounded-3xl border border-[var(--line)] bg-white/55 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            User feedback
          </p>
          <h2 className="mt-1 text-xl font-semibold">Responses and results</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            New responses are shown first. Search looks through names, emails,
            questions, and answers.
          </p>
        </div>
      </div>

      {(message || error) && (
        <div
          className={`rounded-2xl border p-3 text-sm font-medium ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {error || message}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
            <h3 className="font-semibold">Question summary</h3>
            <div className="mt-3 space-y-3">
              {groupedAnswers.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No questions yet.</p>
              ) : (
                groupedAnswers.map(({ question, total, counts, latest }) => (
                  <article
                    key={question.id}
                    className="rounded-xl border border-[var(--line)] bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold leading-5">
                          {question.prompt}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {questionTypeLabel(question.question_type)} | {total}{" "}
                          answers
                        </p>
                      </div>
                    </div>
                    {counts.length === 0 ? (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        No answers yet.
                      </p>
                    ) : question.question_type === "short_text" ||
                      question.question_type === "long_text" ? (
                      <div className="mt-2 space-y-1">
                        {latest.map((value, index) => (
                          <p
                            key={`${value}-${index}`}
                            className="line-clamp-2 rounded-lg bg-[var(--chip)] px-2 py-1.5 text-xs leading-5"
                          >
                            {value}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {counts.slice(0, 6).map(([value, count]) => (
                          <span
                            key={value}
                            className="rounded-full border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1 text-xs font-semibold"
                          >
                            {value}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
            <div className="grid gap-2 md:grid-cols-[1fr_12rem]">
              <label className="block text-sm font-medium">
                Search responses
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
                  placeholder="Search by answer, question, name, email..."
                />
              </label>
              <label className="block text-sm font-medium">
                Status
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
                >
                  <option value="all">All ({counts.all})</option>
                  <option value="new">New ({counts.new})</option>
                  <option value="read">Read ({counts.read})</option>
                  <option value="archived">Archived ({counts.archived})</option>
                </select>
              </label>
            </div>
          </div>

          {filteredResponses.length === 0 ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-5 text-sm text-[var(--muted)]">
              No responses match this view.
            </div>
          ) : (
            filteredResponses.map((response) => {
              const responseAnswers = answersByResponse.get(response.id) ?? [];
              return (
                <article
                  key={response.id}
                  className={`rounded-2xl border bg-[var(--card)] p-4 shadow-sm ${
                    response.status === "new"
                      ? "border-blue-200 ring-2 ring-blue-50"
                      : "border-[var(--line)]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] ${statusClasses(
                            response.status
                          )}`}
                        >
                          {response.status}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {new Date(response.created_at).toLocaleString("en-GB")}
                        </span>
                      </div>
                      <h3 className="mt-2 text-base font-semibold">
                        {responseName(response)}
                      </h3>
                      {response.respondent_email && (
                        <p className="text-xs text-[var(--muted)]">
                          {response.respondent_email}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {response.status !== "read" && (
                        <button
                          type="button"
                          onClick={() => updateResponse(response, "read")}
                          disabled={busyId === response.id}
                          className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-medium shadow-sm disabled:opacity-60"
                        >
                          Mark read
                        </button>
                      )}
                      {response.status !== "archived" && (
                        <button
                          type="button"
                          onClick={() => updateResponse(response, "archive")}
                          disabled={busyId === response.id}
                          className="rounded-full border border-[var(--line)] bg-white px-3 py-1 text-xs font-medium shadow-sm disabled:opacity-60"
                        >
                          Archive
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updateResponse(response, "delete")}
                        disabled={busyId === response.id}
                        className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 shadow-sm disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <dl className="mt-3 divide-y divide-[var(--line)] overflow-hidden rounded-xl border border-[var(--line)] bg-white">
                    {responseAnswers.map((answer) => (
                      <div key={answer.id} className="grid gap-1 p-3 sm:grid-cols-[12rem_1fr]">
                        <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
                          {answer.question_prompt}
                        </dt>
                        <dd className="whitespace-pre-wrap text-sm leading-6">
                          {answerText(answer)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
