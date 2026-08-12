import crypto from "crypto";
import { timingSafeCompare } from "./crypto";

/**
 * Verify Telegram Login Widget data
 *
 * @param data Data from Telegram widget
 * @param botToken Your Bot Token
 * @returns boolean True if verification success
 */
export function checkTelegramHash(
  data: Record<string, unknown>,
  botToken: string,
): boolean {
  if (!data || !data.hash) return false;

  const { hash, ...userData } = data;
  if (typeof hash !== "string") return false;

  // Sort keys alphabetically
  const dataCheckArr = Object.keys(userData)
    .sort()
    .map((key) => `${key}=${userData[key]}`);

  const dataCheckString = dataCheckArr.join("\n");

  // SHA256 of bot secret token
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // HMAC-SHA256 of dataCheckString using secretKey as base
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  return timingSafeCompare(hmac, hash);
}

/**
 * Verify Telegram Web App (Mini App) initData
 * Uses HMAC_SHA256("WebAppData", botToken) as secret key
 */
export function checkTWAHash(initData: string, botToken: string): boolean {
  if (!initData) return false;
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get("hash");
  if (!hash) return false;
  urlParams.delete("hash");
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const hmac = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  return timingSafeCompare(hmac, hash);
}
