import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_TYPES = new Set([
  "short_text",
  "long_text",
  "single_choice",
  "multi_choice",
  "rating",
  "yes_no",
]);

const CHOICE_TYPES = new Set(["single_choice", "multi_choice"]);

function redirectToFeedback(
  req: NextRequest,
  kind: "success" | "error",
  message: string
) {
  const url = new URL("/admin/feedback", getBaseUrl(req));
  url.searchParams.set("feedbackStatus", kind);
  url.searchParams.set("feedbackMessage", message);
  return NextResponse.redirect(url, { status: 303 });
}

function parseOptions(value: string) {
  return value
    .split(/\r?\n/)
    .map((option) => option.trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const isJson = req.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await req.json().catch(() => ({})) : null;
  const form = isJson ? null : await req.formData();
  const formId = String((isJson ? payload.formId : form?.get("form_id")) ?? "").trim();
  const prompt = String((isJson ? payload.prompt : form?.get("prompt")) ?? "").trim();
  const helpText = String(
    (isJson ? payload.helpText : form?.get("help_text")) ?? ""
  ).trim();
  const questionType = String(
    (isJson ? payload.questionType : form?.get("question_type")) ?? ""
  ).trim();
  const optionsText = String(
    (isJson ? payload.optionsText : form?.get("options_text")) ?? ""
  );
  const options = Array.isArray(payload?.options)
    ? payload.options.map((item: unknown) => String(item).trim()).filter(Boolean)
    : parseOptions(optionsText);
  const required = isJson ? Boolean(payload.required) : form?.get("required") === "on";
  const sortOrder = Number(
    (isJson ? payload.sortOrder : form?.get("sort_order")) ?? 0
  );

  const fail = (message: string, status = 400) =>
    isJson
      ? NextResponse.json({ error: message }, { status })
      : redirectToFeedback(req, "error", message);

  if (!formId) {
    return fail("Missing feedback form.");
  }
  if (!prompt) {
    return fail("Please add a question.");
  }
  if (!VALID_TYPES.has(questionType)) {
    return fail("Question type is not valid.");
  }
  if (CHOICE_TYPES.has(questionType) && options.length < 2) {
    return fail("Choice questions need at least two options.");
  }
  if (!Number.isFinite(sortOrder)) {
    return fail("Question order must be a number.");
  }

  const db = supabaseServer();
  const { data, error } = await db
    .from("feedback_questions")
    .insert({
      form_id: formId,
      prompt,
      help_text: helpText || null,
      question_type: questionType,
      options: CHOICE_TYPES.has(questionType) ? options : [],
      required,
      sort_order: Math.round(sortOrder),
    })
    .select("id,prompt,help_text,question_type,options,required,sort_order,created_at")
    .single();

  if (error) {
    if (isJson) {
      return NextResponse.json(
        { error: `Could not add question: ${error.message}` },
        { status: 500 }
      );
    }
    return redirectToFeedback(
      req,
      "error",
      `Could not add question: ${error.message}`
    );
  }

  if (isJson) {
    return NextResponse.json({ ok: true, question: data });
  }

  return redirectToFeedback(req, "success", "Feedback question added.");
}
