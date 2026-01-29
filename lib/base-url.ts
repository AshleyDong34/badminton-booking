export function getBaseUrl(req: Request): string {
  const envBase = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envBase && /^https?:\/\//i.test(envBase)) {
    return envBase.replace(/\/+$/, "");
  }
  return new URL(req.url).origin;
}
