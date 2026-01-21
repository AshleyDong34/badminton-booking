import { createClient } from "@supabase/supabase-js";
import "server-only";

export function supabaseServer() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server secret
  return createClient(url, key, { auth: { persistSession: false } });
}
