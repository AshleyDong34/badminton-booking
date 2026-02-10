import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";

const EVENTS = new Set(["level_doubles", "mixed_doubles"]);
const LEVELS = new Set([1, 2, 3, 4, 5, 6, 7]);
const LEVEL_DOUBLES_TYPES = new Set(["mens_doubles", "womens_doubles"]);

function calculatePairStrength(args: {
  playerOneLevel: number;
  playerTwoLevel: number;
  event: string;
  levelDoublesType: string | null;
}) {
  const base = args.playerOneLevel + args.playerTwoLevel;
  if (args.event === "level_doubles" && args.levelDoublesType === "womens_doubles") {
    return base + 3;
  }
  return base;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const redirect = String(form.get("redirect") ?? "/admin/club-champs");
  const event = String(form.get("event") ?? "").trim();
  const playerOneName = String(form.get("player_one_name") ?? "").trim();
  const playerTwoName = String(form.get("player_two_name") ?? "").trim();
  const playerOneLevel = Number(form.get("player_one_level"));
  const playerTwoLevel = Number(form.get("player_two_level"));
  const levelDoublesTypeRaw = String(form.get("level_doubles_type") ?? "").trim();
  const levelDoublesType = event === "level_doubles" ? levelDoublesTypeRaw : null;

  if (
    !event ||
    !playerOneName ||
    !playerTwoName ||
    !Number.isFinite(playerOneLevel) ||
    !Number.isFinite(playerTwoLevel)
  ) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs?error=Missing+required+fields`, getBaseUrl(req))
    );
  }

  if (!EVENTS.has(event)) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs?error=Invalid+event+type`, getBaseUrl(req))
    );
  }

  if (!LEVELS.has(playerOneLevel) || !LEVELS.has(playerTwoLevel)) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs?error=Invalid+player+level`, getBaseUrl(req))
    );
  }

  if (event === "level_doubles" && !LEVEL_DOUBLES_TYPES.has(levelDoublesTypeRaw)) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs?error=Choose+mens+or+womens+doubles`, getBaseUrl(req))
    );
  }

  if (playerOneName.toLowerCase() === playerTwoName.toLowerCase()) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs?error=Players+must+be+different`, getBaseUrl(req))
    );
  }

  const pairStrength = calculatePairStrength({
    playerOneLevel,
    playerTwoLevel,
    event,
    levelDoublesType,
  });

  const db = supabaseServer();
  const { error } = await db.from("club_champs_pairs").insert({
    event,
    level_doubles_type: levelDoublesType,
    player_one_name: playerOneName,
    player_one_level: playerOneLevel,
    player_two_name: playerTwoName,
    player_two_level: playerTwoLevel,
    pair_strength: pairStrength,
  });

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/club-champs?error=${encodeURIComponent(error.message)}`, getBaseUrl(req))
    );
  }

  return NextResponse.redirect(
    new URL(`${redirect}${redirect.includes("?") ? "&" : "?"}ok=1`, getBaseUrl(req))
  );
}
