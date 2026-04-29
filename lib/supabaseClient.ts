// lib/supabaseClient.ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_AUTH_COOKIE_OPTIONS } from "./supabase-auth-cookie-options";

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // use anon key (fine) or publishable key if you have it
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    auth: {
      detectSessionInUrl: true,
    },
  }
);
