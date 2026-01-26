"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const mail = email.trim().toLowerCase();
    if (!mail || !mail.includes("@")) {
      setMsg("Enter a valid email.");
      setLoading(false);
      return;
    }

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: mail,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) throw error;

      setMsg("Magic link sent. Check your inbox (and Junk).");
    } catch (err: any) {
      setMsg(err?.message ?? "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Admin sign in</h1>

        <div className="rounded-2xl p-5 shadow space-y-4">
          <form onSubmit={requestLink} className="space-y-4">
            <label className="block text-sm">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border p-2"
              placeholder="committee@club.org"
            />

            <button disabled={loading} className="w-full rounded-xl p-2 border">
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>
        </div>

        {msg && <p className="text-sm opacity-80">{msg}</p>}
      </div>
    </div>
  );
}
