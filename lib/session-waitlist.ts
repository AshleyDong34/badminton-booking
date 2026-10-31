import "server-only";
import { sendEmail } from "@/lib/email";
import { buildPromotionEmail } from "@/lib/email-templates";
import { getBookingCredits } from "@/lib/booking-credits";
import { supabaseServer } from "@/lib/supabase-server";

type Db = ReturnType<typeof supabaseServer>;

type SessionDetails = {
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
};

type WaitlistCandidate = {
  id: string;
  name: string | null;
  email: string | null;
  cancel_token: string | null;
  student_id: string | null;
  created_at: string;
  is_taster: boolean;
};

type PromotionResult = {
  promoted: boolean;
  emailSent: boolean;
  emailError: string | null;
};

export async function getWaitlistCandidates(
  db: Db,
  sessionId: string
): Promise<WaitlistCandidate[]> {
  const candidates: WaitlistCandidate[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("signups")
      .select("id,name,email,student_id,created_at,cancel_token,is_taster")
      .eq("session_id", sessionId)
      .eq("status", "waiting_list")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`Could not read waitlist: ${error.message}`);
    candidates.push(...((data ?? []) as WaitlistCandidate[]));
    if (!data || data.length < 1000) break;
  }
  return candidates;
}

export async function sendPromotionEmailIfPromoted({
  db,
  candidate,
  session,
  baseUrl,
}: {
  db: Db;
  candidate: WaitlistCandidate | null;
  session: SessionDetails | null;
  baseUrl: string;
}): Promise<PromotionResult> {
  if (!candidate?.id || !session) {
    return { promoted: false, emailSent: false, emailError: null };
  }

  const { data: promotedRow } = await db
    .from("signups")
    .select("status,email,cancel_token,name,student_id,session_id,created_at,is_taster")
    .eq("id", candidate.id)
    .maybeSingle();

  if (promotedRow?.status !== "signed_up") {
    return { promoted: false, emailSent: false, emailError: null };
  }

  const email = promotedRow.email || candidate.email;
  const cancelToken = promotedRow.cancel_token || candidate.cancel_token;
  const name = promotedRow.name || candidate.name || "";

  if (!email || !cancelToken) {
    return {
      promoted: true,
      emailSent: false,
      emailError: "Promoted person has no email or cancel token.",
    };
  }

  try {
    const cancelUrl = `${baseUrl}/cancel?token=${cancelToken}`;
    const { subject, text, html } = buildPromotionEmail({
      name,
      session,
      cancelUrl,
      isFirstTimeTaster: promotedRow.is_taster,
      credits: await getBookingCredits(db, {
        email,
        student_id: promotedRow.student_id ?? candidate.student_id,
        session_id: promotedRow.session_id,
        created_at: promotedRow.created_at,
      }),
    });
    await sendEmail({ to: email, subject, text, html });
    return { promoted: true, emailSent: true, emailError: null };
  } catch (err) {
    return {
      promoted: true,
      emailSent: false,
      emailError: err instanceof Error ? err.message : "Promotion email failed.",
    };
  }
}

export async function promoteEarliestWaitlistIntoSpaces({
  db,
  sessionId,
  session,
  baseUrl,
  spaces,
}: {
  db: Db;
  sessionId: string;
  session: SessionDetails;
  baseUrl: string;
  spaces: number;
}) {
  let promotedCount = 0;
  let emailSentCount = 0;
  const emailErrors: string[] = [];

  for (let index = 0; index < spaces; index += 1) {
    const candidates = await getWaitlistCandidates(db, sessionId);
    let selected: WaitlistCandidate | null = null;
    for (const candidate of candidates) {
      const credits = await getBookingCredits(db, { ...candidate, session_id: sessionId });
      if (!credits || credits.remainingCredits <= 0) continue;
      const { data: promoted, error } = await db
        .from("signups")
        .update({ status: "signed_up" })
        .eq("id", candidate.id)
        .eq("session_id", sessionId)
        .eq("status", "waiting_list")
        .select("id")
        .maybeSingle();
      if (error) {
        if (!/weekly limit reached/i.test(error.message)) emailErrors.push(error.message);
        continue;
      }
      if (promoted?.id) {
        selected = candidate;
        break;
      }
    }
    if (!selected) break;

    const result = await sendPromotionEmailIfPromoted({
      db,
      candidate: selected,
      session,
      baseUrl,
    });

    if (result.promoted) promotedCount += 1;
    if (result.emailSent) emailSentCount += 1;
    if (result.emailError) emailErrors.push(result.emailError);
  }

  return { promotedCount, emailSentCount, emailErrors };
}
