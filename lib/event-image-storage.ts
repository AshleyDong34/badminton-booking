import "server-only";
import { supabaseServer } from "./supabase-server";

const EVENT_IMAGE_BUCKET = "event-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extensionForImage(file: File) {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "bin";
}

export async function uploadEventImage(fileInput: FormDataEntryValue | null) {
  if (!(fileInput instanceof File) || fileInput.size === 0) return null;

  if (!ALLOWED_IMAGE_TYPES.has(fileInput.type)) {
    throw new Error("Image must be PNG, JPG, WebP, or GIF.");
  }

  if (fileInput.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5MB or smaller.");
  }

  const db = supabaseServer();
  const path = `events/${crypto.randomUUID()}.${extensionForImage(fileInput)}`;
  const { error } = await db.storage.from(EVENT_IMAGE_BUCKET).upload(path, fileInput, {
    contentType: fileInput.type,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = db.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

