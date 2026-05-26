import { NextRequest, NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type FeedbackFormRow = {
  id: string;
  is_active: boolean;
  identity_mode: "anonymous" | "optional" | "required";
};

type FeedbackQuestionRow = {
  id: string;
  prompt: string;
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

function redirectToFeedback(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/feedback", getBaseUrl(req));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 303 });
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(values: FormDataEntryValue[]) {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normaliseOptions(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const honeypot = cleanText(formData.get("website"));

  // Bots often fill hidden fields. Pretend success without storing anything.
  if (honeypot) {
    return redirectToFeedback(req, { sent: "1" });
  }

  const formId = cleanText(formData.get("form_id"));
  const pagePath = cleanText(formData.get("page_path")).slice(0, 300) || "/feedback";

  if (!formId) {
    return redirectToFeedback(req, { error: "Feedback form is not available." });
  }

  const db = supabaseServer();
  const { data: feedbackForm, error: formError } = await db
    .from("feedback_forms")
    .select("id,is_active,identity_mode")
    .eq("id", formId)
    .maybeSingle();

  if (formError || !feedbackForm || !feedbackForm.is_active) {
    return redirectToFeedback(req, { error: "Feedback form is not available." });
  }

  const form = feedbackForm as FeedbackFormRow;
  const { data: questionData, error: questionError } = await db
    .from("feedback_questions")
    .select("id,prompt,question_type,options,required")
    .eq("form_id", form.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (questionError) {
    return redirectToFeedback(req, { error: "Could not load feedback questions." });
  }

  const questions = (questionData ?? []) as FeedbackQuestionRow[];
  const name = cleanText(formData.get("respondent_name"));
  const email = cleanText(formData.get("respondent_email")).toLowerCase();

  if (form.identity_mode === "required") {
    if (!name) {
      return redirectToFeedback(req, { error: "Please enter your name." });
    }
    if (!email || !isValidEmail(email)) {
      return redirectToFeedback(req, { error: "Please enter a valid email." });
    }
  }

  if (email && !isValidEmail(email)) {
    return redirectToFeedback(req, { error: "Please enter a valid email." });
  }

  const answers = [];

  for (const question of questions) {
    const fieldName = `q_${question.id}`;
    const options = normaliseOptions(question.options);
    const values = cleanList(formData.getAll(fieldName));
    const firstValue = values[0] ?? "";

    if (question.required && values.length === 0) {
      return redirectToFeedback(req, {
        error: `Please answer: ${question.prompt}`,
      });
    }

    if (values.length === 0) continue;

    if (
      (question.question_type === "single_choice" ||
        question.question_type === "multi_choice") &&
      options.length > 0 &&
      values.some((value) => !options.includes(value))
    ) {
      return redirectToFeedback(req, { error: "One answer was not valid." });
    }

    if (
      question.question_type === "rating" &&
      (!/^[1-5]$/.test(firstValue) || values.length > 1)
    ) {
      return redirectToFeedback(req, { error: "Rating must be between 1 and 5." });
    }

    if (
      question.question_type === "yes_no" &&
      firstValue !== "Yes" &&
      firstValue !== "No"
    ) {
      return redirectToFeedback(req, { error: "One answer was not valid." });
    }

    const answerText =
      question.question_type === "multi_choice" ? values.join(", ") : firstValue;
    answers.push({
      question_id: question.id,
      question_prompt: question.prompt,
      question_type: question.question_type,
      answer_text: answerText.slice(0, 5000),
      answer_json:
        question.question_type === "multi_choice"
          ? values
          : question.question_type === "rating"
            ? { rating: Number(firstValue) }
            : null,
    });
  }

  const { data: response, error: responseError } = await db
    .from("feedback_responses")
    .insert({
      form_id: form.id,
      respondent_name:
        form.identity_mode === "anonymous" ? null : name || null,
      respondent_email:
        form.identity_mode === "anonymous" ? null : email || null,
      is_anonymous:
        form.identity_mode === "anonymous" || (!name && !email),
      page_path: pagePath,
      status: "new",
    })
    .select("id")
    .single();

  if (responseError || !response) {
    return redirectToFeedback(req, { error: "Could not save feedback." });
  }

  if (answers.length > 0) {
    const { error: answersError } = await db.from("feedback_answers").insert(
      answers.map((answer) => ({
        ...answer,
        response_id: response.id,
      }))
    );

    if (answersError) {
      await db.from("feedback_responses").delete().eq("id", response.id);
      return redirectToFeedback(req, { error: "Could not save feedback." });
    }
  }

  return redirectToFeedback(req, { sent: "1" });
}
