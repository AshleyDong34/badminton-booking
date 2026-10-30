import "server-only";
import type { supabaseServer } from "./supabase-server";
import type { WeeklyCredits } from "./email-templates-core";

type Db = ReturnType<typeof supabaseServer>;

export async function getBookingCredits(
  db: Db,
  signup: { email: string | null; student_id?: string | null; session_id: string; created_at?: string | null }
): Promise<WeeklyCredits | null> {
  if (!signup.email) return null;
  const args: Record<string, string | null> = {
    p_email: signup.email,
    p_student_id: signup.student_id ?? null,
    p_session_id: signup.session_id,
  };
  if (signup.created_at) args.p_booked_at = signup.created_at;
  const { data, error } = await db.rpc("get_booking_credits", args);
  if (error) {
    console.error("Could not read weekly booking credits:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    weeklyQuota: row.weekly_quota,
    usedCredits: row.used_credits,
    remainingCredits: row.remaining_credits,
  };
}
