"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignInPage() {
    // allows the user to go to a different page. router.replace("/admin")
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [devCode, setDevCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  //async when we are awaiting something to return(await, fetch. etc), if only ui updates, then just use sync instead. 
  async function onMagicLink(e: React.FormEvent) {
    //prevents page reloading when submitting.
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
        //send a link to email
      const { error } = await supabase.auth.signInWithOtp({
        email,
        // supabase creates a new token itself that leads to the route in callback to admin page. 
        options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
      });
      if (error) throw error;
      setMsg("Magic link sent. Check your email.");
    } catch (err: any) {
      setMsg(err.message ?? "Failed to send magic link");
    } finally {
      setLoading(false);
    }
  }

  async function onDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {

        // the dev login card method for now. 
      const res = await fetch("/api/dev-login", {
        method: "POST",
        // use the await req.json() method
        headers: { "Content-Type": "application/json" },
        //payload.
        body: JSON.stringify({ code: devCode }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Invalid dev code");
      }
      router.replace("/admin");
    } catch (err: any) {
      setMsg(err.message ?? "Dev login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Admin sign in</h1>
        <div className="rounded-2xl p-5 shadow">
          <form onSubmit={onMagicLink} className="space-y-4">
            <label className="block text-sm">Email (magic link)</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border p-2"
              placeholder="committee@club.org"
            />
            <button disabled={loading} className="w-full rounded-xl p-2 border">
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl p-5 shadow">
          <form onSubmit={onDevLogin} className="space-y-4">
            <label className="block text-sm">Dev code (temporary)</label>
            <input
              type="password"
              value={devCode}
              onChange={(e) => setDevCode(e.target.value)}
              className="w-full rounded-xl border p-2"
              placeholder="Paste the dev code"
            />
            <button disabled={loading} className="w-full rounded-xl p-2 border">
              {loading ? "Checking…" : "Use dev code"}
            </button>
          </form>
        </div>

        {msg && <p className="text-sm opacity-80">{msg}</p>}
      </div>
    </div>
  );
}