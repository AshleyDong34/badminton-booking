import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { supabaseServer } from "@/lib/supabase-server";
import { promoteEarliestWaitlistIntoSpaces } from "@/lib/session-waitlist";

export const runtime = "nodejs";

function redirectToSession(
  req: NextRequest,
  sessionId: string,
  kind: "success" | "error",
  message: string
) {
  const url = new URL(`/admin/sessions/${sessionId}`, getBaseUrl(req));
  url.searchParams.set("capacityStatus", kind);
  url.searchParams.set("capacityMessage", message);
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

  const { id: sessionId } = await ctx.params;
  const form = await req.formData();
  const capacity = Number(form.get("capacity"));

  if (!Number.isInteger(capacity) || capacity < 1) {
    return redirectToSession(
      req,
      sessionId,
      "error",
      "Capacity must be a whole number of at least 1."
    );
  }

  const supabase = supabaseServer();

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id,capacity,name,starts_at,ends_at,notes")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return redirectToSession(req, sessionId, "error", "Session not found.");
  }

  const { count: signedUpCount, error: countError } = await supabase
    .from("signups")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "signed_up");

  if (countError) {
    return redirectToSession(
      req,
      sessionId,
      "error",
      `Could not check current bookings: ${countError.message}`
    );
  }

  const bookedCount = signedUpCount ?? 0;
  if (capacity < bookedCount) {
    return redirectToSession(
      req,
      sessionId,
      "error",
      `Capacity cannot be lower than the ${bookedCount} people already booked.`
    );
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ capacity })
    .eq("id", sessionId);

  if (updateError) {
    return redirectToSession(
      req,
      sessionId,
      "error",
      `Could not update capacity: ${updateError.message}`
    );
  }

  const spacesAfterUpdate = Math.max(0, capacity - bookedCount);
  const promotion =
    spacesAfterUpdate > 0
      ? await promoteEarliestWaitlistIntoSpaces({
          db: supabase,
          sessionId,
          session,
          baseUrl: getBaseUrl(req),
          spaces: spacesAfterUpdate,
        })
      : { promotedCount: 0, emailSentCount: 0, emailErrors: [] };

  const promotionText =
    promotion.promotedCount === 0
      ? ""
      : ` ${promotion.promotedCount} waitlisted ${
          promotion.promotedCount === 1 ? "person was" : "people were"
        } promoted. ${promotion.emailSentCount} notification ${
          promotion.emailSentCount === 1 ? "email was" : "emails were"
        } sent.`;
  const emailErrorText =
    promotion.emailErrors.length === 0
      ? ""
      : ` ${promotion.emailErrors.length} promotion email ${
          promotion.emailErrors.length === 1 ? "failed" : "emails failed"
        }.`;

  return redirectToSession(
    req,
    sessionId,
    promotion.emailErrors.length === 0 ? "success" : "error",
    `Session capacity updated.${promotionText}${emailErrorText}`
  );
}
