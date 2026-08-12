/**
 * URL Validation Utility — SSRF Prevention
 *
 * Validates user-supplied URLs to prevent Server-Side Request Forgery (SSRF).
 * Blocks requests to internal networks, localhost, cloud metadata endpoints,
 * and non-HTTP protocols.
 */

import { URL } from "url";
import dns from "dns";
import { promisify } from "util";
import { ValidationError } from "@/utils/app-errors";

const dnsLookup = promisify(dns.lookup);

/** Regex patterns for private/reserved IP ranges */
const BLOCKED_IP_PATTERNS = [
  /^127\./, // Loopback
  /^0\./, // 0.0.0.0/8
  /^10\./, // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./, // Class B private
  /^192\.168\./, // Class C private
  /^169\.254\./, // Link-local / cloud metadata
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 unique local
  /^fe80:/i, // IPv6 link-local
  /^fd/i, // IPv6 private
];

const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.google",
];

/**
 * Normalize a URL hostname for IP matching:
 * - strips IPv6 brackets ("[::1]" -> "::1")
 * - decodes IPv4-mapped IPv6 ("::ffff:127.0.0.1" and "::ffff:7f00:1" -> "127.0.0.1")
 *
 * Without this, `http://[::1]/` and `http://[::ffff:127.0.0.1]/` bypass every
 * BLOCKED_IP_PATTERNS rule (Node's URL.hostname returns bracketed, hex-encoded
 * forms that match none of the dotted-quad / bare-colon patterns).
 */
function normalizeHostname(hostname: string): string {
  const stripped =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  const v4Mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(stripped);
  if (v4Mapped) return v4Mapped[1];

  // ::ffff:xxxx:xxxx — hex-encoded IPv4 inside IPv6
  const v4Hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(stripped);
  if (v4Hex) {
    const hi = parseInt(v4Hex[1], 16);
    const lo = parseInt(v4Hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }

  return stripped;
}

/**
 * Validate a user-supplied URL for safe server-side fetching.
 * Returns the validated URL string or throws an Error.
 */
export function validateUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ValidationError("Invalid URL format", "url");
  }

  // Protocol whitelist
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError(
      "Only http and https protocols are allowed",
      "protocol",
    );
  }

  const rawHostname = parsed.hostname.toLowerCase();
  const hostname = normalizeHostname(rawHostname);

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.includes(rawHostname)) {
    throw new ValidationError(
      "Access to internal hosts is not allowed",
      "host",
    );
  }

  // Block IP-based access to private ranges
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new ValidationError(
        "Access to private/internal IP addresses is not allowed",
        "ip",
      );
    }
  }

  // Block cloud metadata IP explicitly
  if (hostname === "169.254.169.254") {
    throw new ValidationError(
      "Access to cloud metadata endpoint is not allowed",
      "endpoint",
    );
  }

  return input;
}

/**
 * Validate URL and additionally resolve DNS to ensure the hostname
 * does not point to a private IP (DNS rebinding prevention).
 * Use this for high-risk operations where the URL will be fetched.
 */
export async function validateUrlWithDns(input: string): Promise<string> {
  // First pass: static validation
  validateUrl(input);

  const parsed = new URL(input);
  const hostname = parsed.hostname;
  const normalized = normalizeHostname(hostname.toLowerCase());

  // Skip DNS check for IP literals (already checked by validateUrl via normalizeHostname)
  if (normalized.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return input;
  }

  try {
    const { address } = await dnsLookup(hostname);
    const normalizedAddress = normalizeHostname(address.toLowerCase());
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(normalizedAddress)) {
        throw new ValidationError(
          `Hostname ${hostname} resolves to a private IP address`,
          "hostname",
        );
      }
    }
    if (normalizedAddress === "169.254.169.254") {
      throw new ValidationError(
        `Hostname ${hostname} resolves to cloud metadata endpoint`,
        "hostname",
      );
    }
  } catch (err) {
    if ((err as Error).message.includes("resolves to")) throw err;
    // DNS lookup failure — allow (may be transient), static check already passed
  }

  return input;
}
