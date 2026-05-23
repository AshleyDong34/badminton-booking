import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAdmin } from "@/lib/adminGuard";
import { getBaseUrl } from "@/lib/base-url";
import { uploadEventImage } from "@/lib/event-image-storage";

function cleanOptionalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function redirectToEvents(req: NextRequest, kind: "success" | "error", message: string) {
  const url = new URL("/admin/events", getBaseUrl(req));
  url.searchParams.set("eventStatus", kind);
  url.searchParams.set("eventMessage", message);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    const status = guard.reason === "not_logged_in" ? 401 : 403;
    const error = guard.reason === "not_logged_in" ? "Unauthorized" : "Forbidden";
    return NextResponse.json({ error }, { status });
  }

  const form = await req.formData();
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const linkLabel = String(form.get("link_label") ?? "").trim();
  const rawLinkUrl = String(form.get("link_url") ?? "").trim();
  const linkUrl = cleanOptionalUrl(rawLinkUrl);
  const rawImageUrl = String(form.get("image_url") ?? "").trim();
  const imageAlt = String(form.get("image_alt") ?? "").trim();
  const imageSideRaw = String(form.get("image_side") ?? "right");
  const imageSide = imageSideRaw === "left" ? "left" : "right";
  const expiresOn = String(form.get("expires_on") ?? "").trim();
  const sortOrder = Number(form.get("sort_order") ?? 0);
  const isActive = form.get("is_active") === "on";

  if (!title) {
    return redirectToEvents(req, "error", "Please add an event title.");
  }
  if (!Number.isFinite(sortOrder)) {
    return redirectToEvents(req, "error", "Display order must be a number.");
  }
  if (rawLinkUrl && !linkUrl) {
    return redirectToEvents(
      req,
      "error",
      "Button link must be a valid http or https URL."
    );
  }
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
    return redirectToEvents(req, "error", "Hide after date is not valid.");
  }

  let uploadedImageUrl: string | null = null;
  try {
    uploadedImageUrl = await uploadEventImage(form.get("image_file"));
  } catch (error) {
    return redirectToEvents(
      req,
      "error",
      error instanceof Error ? error.message : "Image upload failed."
    );
  }

  const fieldImageUrl = rawImageUrl ? cleanOptionalUrl(rawImageUrl) : null;
  if (rawImageUrl && !fieldImageUrl) {
    return redirectToEvents(
      req,
      "error",
      "Image URL must be a valid http or https URL."
    );
  }
  const imageUrl = uploadedImageUrl ?? fieldImageUrl;

  const db = supabaseServer();
  const { error } = await db.from("events").insert({
    title,
    body: body || null,
    link_label: linkUrl ? linkLabel || null : null,
    link_url: linkUrl,
    image_url: imageUrl,
    image_alt: imageUrl ? imageAlt || null : null,
    image_side: imageSide,
    expires_on: expiresOn || null,
    sort_order: Math.round(sortOrder),
    is_active: isActive,
  });

  if (error) return redirectToEvents(req, "error", `Could not create event: ${error.message}`);

  return redirectToEvents(req, "success", "Event created and added to the homepage.");
}
