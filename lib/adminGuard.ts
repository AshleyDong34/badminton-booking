import { supabaseSSR } from "@/lib/supabase-ssr";
import { supabaseServer } from "@/lib/supabase-server";

export async function requireAdmin() {
  const supabase = await supabaseSSR();

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { ok: false as const, reason: "not_logged_in" as const };

  // Already admin?
  const { data: admin } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (admin) return { ok: true as const, user };

  // Not admin yet → check if their email is in pending list
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false as const, reason: "not_admin" as const };

  const { data: pending } = await supabase
    .from("pending_admin_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!pending) return { ok: false as const, reason: "not_admin" as const };

  const adminDb = supabaseServer();
  await adminDb.from("admins").insert({ user_id: user.id }).throwOnError();
  await adminDb.from("pending_admin_emails").delete().eq("email", email).throwOnError();

  return { ok: true as const, user };
}
