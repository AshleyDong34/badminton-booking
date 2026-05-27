import "server-only";
import { sendEmail } from "@/lib/email";
import { buildPromotionEmail } from "@/lib/email-templates";
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
};

type PromotionResult = {
  promoted: boolean;
  emailSent: boolean;
  emailError: string | null;
};

export async function getEarliestWaitlistCandidate(
  db: Db,
  sessionId: string
): Promise<WaitlistCandidate | null> {
  const { data } = await db
    .from("signups")
    .select("id,name,email,cancel_token")
    .eq("session_id", sessionId)
    .eq("status", "waiting_list")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as WaitlistCandidate | null) ?? null;
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
    .select("status,email,cancel_token,name")
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
    const candidate = await getEarliestWaitlistCandidate(db, sessionId);
    if (!candidate?.id) break;

    const { data: promoted } = await db
      .from("signups")
      .update({ status: "signed_up" })
      .eq("id", candidate.id)
      .eq("session_id", sessionId)
      .eq("status", "waiting_list")
      .select("id")
      .maybeSingle();

    if (!promoted?.id) continue;

    const result = await sendPromotionEmailIfPromoted({
      db,
      candidate,
      session,
      baseUrl,
    });

    if (result.promoted) promotedCount += 1;
    if (result.emailSent) emailSentCount += 1;
    if (result.emailError) emailErrors.push(result.emailError);
  }

  return { promotedCount, emailSentCount, emailErrors };
}
