import crypto from "crypto";
import { getConfig } from "@/config/env";

/** Pixel/analytics IDs passed to all EJS views */
export function trackingVars() {
  const config = getConfig();
  return {
    fbPixelId: config.FACEBOOK_PIXEL_ID || "",
    ga4Id: config.GA4_TRACKING_ID || "",
    ttPixelId: config.TIKTOK_PIXEL_ID || "",
  };
}

/** HMAC-SHA256 token derived from ADMIN_PASSWORD — not trivially reversible unlike base64 */
export function makeAdminToken(password: string): string {
  return crypto
    .createHmac("sha256", "openclaw-admin-v1")
    .update(password)
    .digest("hex");
}

/** Constant-time string comparison to prevent timing attacks */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
