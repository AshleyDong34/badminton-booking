import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const devRef = "vexdivrcjscxrtnxwohk";
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || new URL(url).hostname !== `${devRef}.supabase.co` || !serviceKey) {
  throw new Error("Integration tests require the known development Supabase URL and its service key. Production is refused.");
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function count(table) {
  const result = await db.from(table).select("id", { count: "exact", head: true });
  assert.equal(result.error, null, result.error?.message);
  return result.count;
}

test("development DB: a stale membership-clear count cannot remove members or taster history", async () => {
  const membersBefore = await count("student_whitelist");
  const historyBefore = await count("first_time_signups");
  const bookingsBefore = await count("signups");

  const result = await db.rpc("clear_membership_roster", { p_expected_count: membersBefore + 1 });
  assert.match(result.error?.message ?? "", /membership list changed/);

  assert.equal(await count("student_whitelist"), membersBefore);
  assert.equal(await count("first_time_signups"), historyBefore);
  assert.equal(await count("signups"), bookingsBefore);
});

test("development DB: public key cannot invoke membership-clear function", async (t) => {
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) return t.skip("No anon key configured for the permission check.");

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const result = await anon.rpc("clear_membership_roster", { p_expected_count: 1 });
  assert.ok(result.error, "Anonymous callers must not be able to clear membership.");
  assert.match(result.error.message, /permission denied|could not find the function/i);
});
