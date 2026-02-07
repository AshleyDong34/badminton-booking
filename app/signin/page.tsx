"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Space_Grotesk } from "next/font/google";
import { supabase } from "@/lib/supabaseClient";

const space = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
    <div className={`${space.className} min-h-screen bg-white text-slate-900`}>
      <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 sm:py-12">
        <div className="w-full max-w-md space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
              Badminton Club
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">Admin sign in</h1>
            <p className="text-xs text-slate-600 sm:text-sm">
              Enter your committee email to receive a magic link.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <form onSubmit={requestLink} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 sm:text-sm">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"
                  placeholder="committee@club.org"
                />
              </div>

              <button
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send magic link"}
              </button>
            </form>
          </div>

          {msg && (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm sm:text-sm">
              {msg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
