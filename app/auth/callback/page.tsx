"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    (async () => {
      try {
        // 1) Try MAGIC LINK first (token_hash + type)
        const tokenHash = params.get("token_hash");
        const type = params.get("type"); // e.g. "magiclink" or "recovery"

        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as "magiclink" | "recovery" | "signup" | "invite" | "email_change",
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else {
          // 2) Fallback: OAuth/PKCE code flow (Google etc.)
          const code = params.get("code");
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          }
        }

        // 3) Optional: get the signed-in user's email
        const { data: userData } = await supabase.auth.getUser();
        const email = userData.user?.email;

        // 4) Ask the server to set an HTTP-only admin cookie that middleware can read
        const res = await fetch("/api/magic-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (!res.ok) {
          router.replace("/signin?error=session");
          return;
        }

        // 5) Go to admin; middleware will allow it now
        router.replace("/admin");
      } catch (err) {
        console.error(err);
        router.replace("/signin?error=callback");
      }
    })();
  }, [router, params]);

  return <p style={{ padding: 16 }}>Signing you in…</p>;
}
