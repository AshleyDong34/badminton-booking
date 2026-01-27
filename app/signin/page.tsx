"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function syncSession() {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            if (isMounted) setMsg(error.message);
            return;
          }

          window.history.replaceState(null, "", "/signin");
          router.replace("/admin");
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (isMounted && data.session) {
        router.replace("/admin");
      }
    }

    syncSession();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        router.replace("/admin");
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

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
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json.error ?? "Failed to send magic link");
      }

      setMsg(json.message ?? "Magic link sent. Check your inbox (and Junk).");
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
