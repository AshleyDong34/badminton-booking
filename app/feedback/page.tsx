import Link from "next/link";
import { Space_Grotesk, Sora } from "next/font/google";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
});

type FeedbackPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

type FeedbackFormRow = {
  id: string;
  title: string;
  description: string | null;
  identity_mode: "anonymous" | "optional" | "required";
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
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normaliseOptions(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function questionStyle(type: FeedbackQuestionRow["question_type"]) {
  if (type === "single_choice") {
    return {
      eyebrow: "Choose one",
      card: "border-[#b8d2e6] bg-[#f4f9fd]",
      accent: "text-[#1f567d]",
    };
  }
  if (type === "multi_choice") {
    return {
      eyebrow: "Choose any that apply",
      card: "border-[#bfe1cc] bg-[#f2fbf5]",
      accent: "text-[#16613f]",
    };
  }
  if (type === "rating") {
    return {
      eyebrow: "Rate from 1 to 5",
      card: "border-[#efd7a5] bg-[#fff9ea]",
      accent: "text-[#8a5b00]",
    };
  }
  if (type === "yes_no") {
    return {
      eyebrow: "Yes or no",
      card: "border-[#d6e4dc] bg-white/78",
      accent: "text-[#16613f]",
    };
  }
  if (type === "short_text") {
    return {
      eyebrow: "Short answer",
      card: "border-[#d6e4dc] bg-white/78",
      accent: "text-[#1f567d]",
    };
  }
  return {
    eyebrow: "Written answer",
    card: "border-[#d6e4dc] bg-white/78",
    accent: "text-[#1f567d]",
  };
}

function QuestionField({ question }: { question: FeedbackQuestionRow }) {
  const name = `q_${question.id}`;
  const options = normaliseOptions(question.options);
  const style = questionStyle(question.question_type);

  return (
    <fieldset className={`rounded-xl border p-0 shadow-sm sm:rounded-2xl ${style.card}`}>
      <legend className="sr-only">
        {question.prompt}
      </legend>
      <div className="p-3.5 sm:p-5">
        <span
          className={`block text-[11px] font-bold uppercase tracking-[0.16em] sm:text-xs ${style.accent}`}
        >
          {style.eyebrow}
        </span>
        <span className="mt-1 block text-[15px] font-semibold leading-5 text-[#0d1b14] sm:text-base">
          {question.prompt}
          {question.required && <span className="text-[#d96b45]"> *</span>}
        </span>
        {question.help_text && (
          <p className="mt-1 text-[13px] leading-5 text-[#3f5048] sm:text-sm sm:leading-6">
            {question.help_text}
          </p>
        )}

        {question.question_type === "short_text" && (
          <input
            name={name}
            required={question.required}
            className="mt-2 w-full rounded-lg border border-[#c9d8cf] bg-white p-2.5 text-sm shadow-inner sm:rounded-xl sm:p-3"
            placeholder="Write your answer"
          />
        )}

        {question.question_type === "long_text" && (
          <textarea
            name={name}
            required={question.required}
            rows={4}
            className="mt-2 w-full rounded-lg border border-[#c9d8cf] bg-white p-2.5 text-sm leading-6 shadow-inner sm:rounded-xl sm:p-3"
            placeholder="Write your answer"
          />
        )}

        {question.question_type === "single_choice" && (
          <div className="mt-2 grid gap-1.5 min-[420px]:grid-cols-2 sm:gap-2">
            {options.map((option) => (
              <label
                key={option}
                className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#c8dceb] bg-white px-3 py-2.5 text-sm font-semibold leading-5 shadow-sm transition hover:-translate-y-0.5 sm:rounded-xl sm:px-4 sm:py-3"
              >
                <input
                  name={name}
                  value={option}
                  type="radio"
                  required={question.required}
                  className="h-4 w-4 accent-[#1f567d]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}

        {question.question_type === "multi_choice" && (
          <div className="mt-2 grid gap-1.5 min-[420px]:grid-cols-2 sm:gap-2">
            {options.map((option) => (
              <label
                key={option}
                className="group flex cursor-pointer items-center gap-2.5 rounded-lg border border-[#c9e2d1] bg-white px-3 py-2.5 text-sm font-semibold leading-5 shadow-sm transition hover:-translate-y-0.5 sm:rounded-xl sm:px-4 sm:py-3"
              >
                <input
                  name={name}
                  value={option}
                  type="checkbox"
                  className="h-4 w-4 rounded accent-[#16613f]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}

        {question.question_type === "rating" && (
          <div className="mt-2 grid grid-cols-5 gap-1.5 sm:gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <label
                key={rating}
                className="cursor-pointer"
              >
                <input
                  name={name}
                  value={rating}
                  type="radio"
                  required={question.required}
                  className="peer sr-only"
                />
                <span className="flex min-h-14 flex-col items-center justify-center rounded-lg border border-[#efd7a5] bg-white px-1 py-2 text-center text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 peer-checked:border-[#d96b45] peer-checked:bg-[#fff0df] peer-checked:ring-2 peer-checked:ring-[#f4c493] sm:min-h-16 sm:rounded-xl">
                  <span className="text-lg font-bold leading-none">{rating}</span>
                  <span className="mt-1 min-h-3 text-[10px] leading-none text-[#6b5a38]">
                    {rating === 1 ? "Low" : rating === 5 ? "High" : ""}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {question.question_type === "yes_no" && (
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:gap-2">
            {["Yes", "No"].map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-lg border bg-white px-3 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-0.5 sm:rounded-xl sm:px-4 sm:py-3 ${
                  option === "Yes" ? "border-green-200" : "border-red-200"
                }`}
              >
                <input
                  name={name}
                  value={option}
                  type="radio"
                  required={question.required}
                  className={`h-4 w-4 ${
                    option === "Yes" ? "accent-[#16613f]" : "accent-[#d96b45]"
                  }`}
                />
                {option}
              </label>
            ))}
          </div>
        )}
      </div>
    </fieldset>
  );
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const params = searchParams ? await searchParams : {};
  const sent = firstSearchValue(params.sent) === "1";
  const error = firstSearchValue(params.error);

  const db = supabaseServer();
  const { data: formData } = await db
    .from("feedback_forms")
    .select("id,title,description,identity_mode")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const form = formData as FeedbackFormRow | null;
  const { data: questionData } = form
    ? await db
        .from("feedback_questions")
        .select("id,prompt,help_text,question_type,options,required")
        .eq("form_id", form.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
    : { data: [] };

  const questions = (questionData ?? []) as FeedbackQuestionRow[];

  return (
    <main
      className={`${space.className} min-h-screen bg-[radial-gradient(circle_at_12%_10%,rgba(180,214,188,0.58),transparent_30%),linear-gradient(135deg,#eef5ef_0%,#f7faf7_48%,#e8f2ec_100%)] px-5 py-6 text-[#0d1b14] sm:px-8`}
    >
      <div className="mx-auto max-w-3xl space-y-5">
        <Link
          href="/"
          className="inline-flex rounded-full border border-[#d6e4dc] bg-white/85 px-4 py-2 text-sm font-semibold shadow-sm"
        >
          Back to main page
        </Link>

        <section className="rounded-3xl border border-[#d6e4dc] bg-[#fffdf8]/88 p-6 shadow-[0_20px_70px_rgba(18,42,28,0.12)] backdrop-blur-xl sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#1f567d]">
            EUBC feedback
          </p>
          <h1 className={`${sora.className} mt-3 text-4xl font-bold sm:text-5xl`}>
            {form?.title ?? "Feedback is not open"}
          </h1>
          {form?.description && (
            <p className="mt-4 text-base leading-7 text-[#3f5048]">
              {form.description}
            </p>
          )}
        </section>

        {sent && (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800">
            Thanks, your feedback has been sent.
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}

        {!form || questions.length === 0 ? (
          <div className="rounded-2xl border border-[#d6e4dc] bg-white/80 p-6 text-sm leading-6 text-[#3f5048]">
            There is no feedback form available right now.
          </div>
        ) : (
          <form
            action="/api/public/feedback"
            method="post"
            className="space-y-3 sm:space-y-4"
          >
            <input type="hidden" name="form_id" value={form.id} />
            <input type="hidden" name="page_path" value="/feedback" />
            <input
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            {form.identity_mode !== "anonymous" && (
              <section className="rounded-2xl border border-[#d6e4dc] bg-white/78 p-5 shadow-sm">
                <h2 className="font-semibold">
                  Your details
                  {form.identity_mode === "required" && (
                    <span className="text-[#d96b45]"> *</span>
                  )}
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#3f5048]">
                  {form.identity_mode === "required"
                    ? "This feedback form asks for contact details."
                    : "Optional. Leave blank if you want to stay anonymous."}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    name="respondent_name"
                    required={form.identity_mode === "required"}
                    className="rounded-xl border border-[#c9d8cf] bg-white p-3 text-sm"
                    placeholder="Name"
                  />
                  <input
                    name="respondent_email"
                    type="email"
                    required={form.identity_mode === "required"}
                    className="rounded-xl border border-[#c9d8cf] bg-white p-3 text-sm"
                    placeholder="Email"
                  />
                </div>
              </section>
            )}

            {questions.map((question) => (
              <QuestionField key={question.id} question={question} />
            ))}

            <button className="w-full rounded-2xl bg-[#16613f] px-5 py-3 text-sm font-bold text-white shadow-sm sm:w-auto">
              Submit feedback
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
