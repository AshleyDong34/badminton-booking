import "server-only";
import type { supabaseServer } from "./supabase-server";
import type { WeeklyCredits } from "./email-templates-core";

type Db = ReturnType<typeof supabaseServer>;

export async function getBookingCredits(
  db: Db,
  signup: { email: string | null; student_id?: string | null; session_id: string }
): Promise<WeeklyCredits | null> {
  if (!signup.email) return null;
  const { data, error } = await db.rpc("get_booking_credits", {
    p_email: signup.email,
    p_student_id: signup.student_id ?? null,
    p_session_id: signup.session_id,
  });
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
