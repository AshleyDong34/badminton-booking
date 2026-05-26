import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import FeedbackQuestionManager from "./FeedbackQuestionManager";
import FeedbackResponsesPanel from "./FeedbackResponsesPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FeedbackPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

type FeedbackFormRow = {
  id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  identity_mode: "anonymous" | "optional" | "required";
  created_at: string;
};

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

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getOrCreateForm() {
  const db = supabaseServer();
  const { data: existing } = await db
    .from("feedback_forms")
    .select("id,title,description,is_active,identity_mode,created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing) return existing as FeedbackFormRow;

  const { data: created, error } = await db
    .from("feedback_forms")
    .insert({
      title: "Website feedback",
      description:
        "Tell us what is working, what is broken, or what could be improved.",
      is_active: true,
      identity_mode: "anonymous",
    })
    .select("id,title,description,is_active,identity_mode,created_at")
    .single();

  if (error) throw new Error(error.message);
  return created as FeedbackFormRow;
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const params = searchParams ? await searchParams : {};
  const feedbackStatus = firstSearchValue(params.feedbackStatus);
  const feedbackMessage = firstSearchValue(params.feedbackMessage);
  const isSuccessMessage = feedbackStatus === "success";

  const form = await getOrCreateForm();
  const db = supabaseServer();

  const { data: questionData, error: questionError } = await db
    .from("feedback_questions")
    .select("id,prompt,help_text,question_type,options,required,sort_order,created_at")
    .eq("form_id", form.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: responseData, error: responseError } = await db
    .from("feedback_responses")
    .select("id,respondent_name,respondent_email,is_anonymous,status,page_path,created_at")
    .eq("form_id", form.id)
    .order("created_at", { ascending: false });

  const responses = (responseData ?? []) as FeedbackResponseRow[];
  const responseIds = responses.map((response) => response.id);
  const { data: answerData, error: answerError } =
    responseIds.length > 0
      ? await db
          .from("feedback_answers")
          .select(
            "id,response_id,question_id,question_prompt,question_type,answer_text,answer_json"
          )
          .in("response_id", responseIds)
      : { data: [], error: null };

  const questions = (questionData ?? []) as FeedbackQuestionRow[];
  const answers = (answerData ?? []) as FeedbackAnswerRow[];

  const newCount = responses.filter((response) => response.status === "new").length;
  const archivedCount = responses.filter(
    (response) => response.status === "archived"
  ).length;

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Build the public feedback form and review submitted answers.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/feedback"
            className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-medium shadow-sm"
          >
            Open public form
          </Link>
          <Link
            href={`/api/admin/feedback/export?form_id=${form.id}`}
            className="rounded-full bg-[var(--cool)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Export Excel
          </Link>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`rounded-2xl border p-4 text-sm font-medium shadow-sm ${
            isSuccessMessage
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {feedbackMessage}
        </div>
      )}

      {(questionError || responseError || answerError) && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load some feedback data.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Questions
          </p>
          <p className="mt-2 text-2xl font-bold">{questions.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Responses
          </p>
          <p className="mt-2 text-2xl font-bold">{responses.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            New
          </p>
          <p className="mt-2 text-2xl font-bold">{newCount}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Archived
          </p>
          <p className="mt-2 text-2xl font-bold">{archivedCount}</p>
        </div>
      </div>

      <section className="space-y-5 rounded-3xl border border-[var(--line)] bg-white/55 p-4 shadow-sm sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            Form builder
          </p>
          <h2 className="mt-1 text-xl font-semibold">Creation and settings</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Edit what players see on the public feedback form.
          </p>
        </div>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <form
            action="/api/admin/feedback/form"
            method="post"
            className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm"
          >
            <input type="hidden" name="form_id" value={form.id} />
            <h3 className="text-lg font-semibold">Form settings</h3>
            <label className="block text-sm font-medium">
              Title
              <input
                name="title"
                required
                defaultValue={form.title}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Description
              <textarea
                name="description"
                rows={3}
                defaultValue={form.description ?? ""}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm leading-6"
              />
            </label>
            <label className="block text-sm font-medium">
              Identity mode
              <select
                name="identity_mode"
                defaultValue={form.identity_mode}
                className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white p-2 text-sm"
              >
                <option value="anonymous">Anonymous only</option>
                <option value="optional">Optional name/email</option>
                <option value="required">Require name/email</option>
              </select>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  name="is_active"
                  type="checkbox"
                  defaultChecked={form.is_active}
                />
                Public form open
              </label>
              <button
                name="intent"
                value="update"
                className="rounded-xl bg-[var(--ok)] px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                Save settings
              </button>
            </div>
          </form>

          <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Danger zone</h3>
            <p className="text-sm leading-6 text-[var(--muted)]">
              Clear responses keeps the form and questions. Delete current form
              removes questions and responses, then creates a blank default form.
            </p>
            <form action="/api/admin/feedback/form" method="post">
              <input type="hidden" name="form_id" value={form.id} />
              <button
                name="intent"
                value="clear_responses"
                className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm"
              >
                Clear all responses
              </button>
            </form>
            <form action="/api/admin/feedback/form" method="post">
              <input type="hidden" name="form_id" value={form.id} />
              <button
                name="intent"
                value="delete_form"
                className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm"
              >
                Delete current form
              </button>
            </form>
          </div>
        </section>

        <FeedbackQuestionManager formId={form.id} initialQuestions={questions} />
      </section>

      <FeedbackResponsesPanel
        questions={questions}
        responses={responses}
        answers={answers}
      />
    </div>
  );
}
