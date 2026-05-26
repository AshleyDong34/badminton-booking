import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_IDENTITY_MODES = new Set(["anonymous", "optional", "required"]);

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

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const intent = String(form.get("intent") ?? "update");
  const formId = String(form.get("form_id") ?? "").trim();
  const db = supabaseServer();

  if (!formId) {
    return redirectToFeedback(req, "error", "Missing feedback form.");
  }

  if (intent === "clear_responses") {
    const { error } = await db
      .from("feedback_responses")
      .delete()
      .eq("form_id", formId);
    if (error) {
      return redirectToFeedback(
        req,
        "error",
        `Could not clear responses: ${error.message}`
      );
    }
    return redirectToFeedback(req, "success", "Feedback responses cleared.");
  }

  if (intent === "delete_form") {
    const { error } = await db.from("feedback_forms").delete().eq("id", formId);
    if (error) {
      return redirectToFeedback(
        req,
        "error",
        `Could not delete feedback form: ${error.message}`
      );
    }

    await db.from("feedback_forms").insert({
      title: "Website feedback",
      description:
        "Tell us what is working, what is broken, or what could be improved.",
      is_active: true,
      identity_mode: "anonymous",
    });

    return redirectToFeedback(
      req,
      "success",
      "Feedback form deleted and replaced with a blank form."
    );
  }

  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const identityMode = String(form.get("identity_mode") ?? "anonymous");
  const isActive = form.get("is_active") === "on";

  if (!title) {
    return redirectToFeedback(req, "error", "Please add a feedback form title.");
  }
  if (!VALID_IDENTITY_MODES.has(identityMode)) {
    return redirectToFeedback(req, "error", "Identity mode is not valid.");
  }

  const { error } = await db
    .from("feedback_forms")
    .update({
      title,
      description: description || null,
      identity_mode: identityMode,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", formId);

  if (error) {
    return redirectToFeedback(
      req,
      "error",
      `Could not save feedback form: ${error.message}`
    );
  }

  return redirectToFeedback(req, "success", "Feedback form settings saved.");
}
