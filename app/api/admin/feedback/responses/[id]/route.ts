import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";

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

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const { id } = await ctx.params;
  const isJson = req.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await req.json().catch(() => ({})) : null;
  const form = isJson ? null : await req.formData();
  const intent = String((isJson ? payload.intent : form?.get("intent")) ?? "delete");
  const db = supabaseServer();

  if (intent === "delete") {
    const { error } = await db.from("feedback_responses").delete().eq("id", id);
    if (error) {
      if (isJson) {
        return NextResponse.json(
          { error: `Could not delete response: ${error.message}` },
          { status: 500 }
        );
      }
      return redirectToFeedback(
        req,
        "error",
        `Could not delete response: ${error.message}`
      );
    }
    if (isJson) {
      return NextResponse.json({ ok: true });
    }
    return redirectToFeedback(req, "success", "Feedback response deleted.");
  }

  const status =
    intent === "archive" ? "archived" : intent === "read" ? "read" : null;

  if (!status) {
    if (isJson) {
      return NextResponse.json({ error: "Unknown feedback action." }, { status: 400 });
    }
    return redirectToFeedback(req, "error", "Unknown feedback action.");
  }

  const { error } = await db
    .from("feedback_responses")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    if (isJson) {
      return NextResponse.json(
        { error: `Could not update response: ${error.message}` },
        { status: 500 }
      );
    }
    return redirectToFeedback(
      req,
      "error",
      `Could not update response: ${error.message}`
    );
  }

  if (isJson) {
    return NextResponse.json({ ok: true, status });
  }

  return redirectToFeedback(req, "success", "Feedback response updated.");
}
