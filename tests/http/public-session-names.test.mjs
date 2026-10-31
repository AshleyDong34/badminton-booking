import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createClient } from "@supabase/supabase-js";

const devRef = "vexdivrcjscxrtnxwohk";
const url = process.env.SUPABASE_URL;
const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || new URL(url).hostname !== `${devRef}.supabase.co` ||
    anonUrl !== url || !serviceKey || !anonKey) {
  throw new Error("HTTP integration test requires the known development Supabase project. Production is refused.");
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const run = randomUUID().slice(0, 8);

function good(result) {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next.js exited with ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/public/settings`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js did not start within 15 seconds");
}

test("public player list obeys the setting, excludes waitlist, and blocks direct anonymous reads", { timeout: 60000 }, async () => {
  let sessionId;
  let originalSetting;
  let child;
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const current = good(await db.from("settings").select("show_public_signup_names,sessions_public_enabled,booking_window_days").eq("id", 1).single());
    originalSetting = current.show_public_signup_names;
    assert.equal(current.sessions_public_enabled, true, "Dev must have public sessions enabled for this test");

    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      cwd: process.cwd(), env: process.env, stdio: "ignore", windowsHide: true,
    });
    await waitForServer(baseUrl, child);

    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const session = good(await db.from("sessions").insert({
      name: `TEST ${run} public names`, capacity: 1,
      starts_at: startsAt.toISOString(),
      ends_at: new Date(startsAt.getTime() + 60 * 60 * 1000).toISOString(),
      allow_name_only: true,
    }).select("id").single());
    sessionId = session.id;
    good(await db.from("signups").insert([
      { session_id: sessionId, name: `TEST ${run} Confirmed`, email: `test-${run}-confirmed@example.invalid`, status: "signed_up" },
      { session_id: sessionId, name: `TEST ${run} Waiting`, email: `test-${run}-waiting@example.invalid`, status: "waiting_list" },
    ]));

    const getPublic = async () => {
      const response = await fetch(`${baseUrl}/api/public/sessions/${sessionId}`, { cache: "no-store" });
      if (response.status !== 200) {
        throw new Error(`Public session endpoint returned ${response.status}: ${await response.text()}`);
      }
      return response.json();
    };

    good(await db.from("settings").update({ show_public_signup_names: false }).eq("id", 1));
    const hidden = await getPublic();
    assert.equal(hidden.session.show_public_signup_names, false);
    assert.equal(hidden.session.signed_up_count, 1);
    assert.equal(hidden.session.waitlist_count, 1);
    assert.equal("confirmed_names" in hidden.session, false);
    assert.doesNotMatch(JSON.stringify(hidden), /Confirmed|Waiting|example\.invalid/);

    const directRead = await anon.from("signups").select("*").eq("session_id", sessionId);
    assert.equal(directRead.data?.length ?? 0, 0, "Anonymous client must not see raw signups");

    good(await db.from("settings").update({ show_public_signup_names: true }).eq("id", 1));
    const visible = await getPublic();
    assert.equal(visible.session.show_public_signup_names, true);
    assert.deepEqual(visible.session.confirmed_names, [`TEST ${run} Confirmed`]);
    assert.doesNotMatch(JSON.stringify(visible), /example\.invalid|cancel_token|student_id|Waiting/);

    good(await db.from("signups").delete().eq("session_id", sessionId).eq("status", "signed_up"));
    const afterPromotion = await getPublic();
    assert.deepEqual(afterPromotion.session.confirmed_names, [`TEST ${run} Waiting`]);

    good(await db.from("settings").update({ show_public_signup_names: false }).eq("id", 1));
    const hiddenAgain = await getPublic();
    assert.equal("confirmed_names" in hiddenAgain.session, false);
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (sessionId) {
      good(await db.from("signups").delete().eq("session_id", sessionId));
      good(await db.from("sessions").delete().eq("id", sessionId));
      assert.equal(good(await db.from("signups").select("id").eq("session_id", sessionId)).length, 0);
      assert.equal(good(await db.from("sessions").select("id").eq("id", sessionId)).length, 0);
    }
    if (originalSetting !== undefined) {
      good(await db.from("settings").update({ show_public_signup_names: originalSetting }).eq("id", 1));
      assert.equal(good(await db.from("settings").select("show_public_signup_names").eq("id", 1).single()).show_public_signup_names, originalSetting);
    }
  }
});
