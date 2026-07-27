/**
 * URL Validation Utility — SSRF Prevention
 *
 * Validates user-supplied URLs to prevent Server-Side Request Forgery (SSRF).
 * Blocks requests to internal networks, localhost, cloud metadata endpoints,
 * and non-HTTP protocols.
 */

import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';
import { ValidationError } from '@/utils/app-errors';

const dnsLookup = promisify(dns.lookup);

/** Regex patterns for private/reserved IP ranges */
const BLOCKED_IP_PATTERNS = [
  /^127\./,                       // Loopback
  /^0\./,                         // 0.0.0.0/8
  /^10\./,                        // Class A private
  /^172\.(1[6-9]|2\d|3[01])\./,  // Class B private
  /^192\.168\./,                  // Class C private
  /^169\.254\./,                  // Link-local / cloud metadata
  /^::1$/,                        // IPv6 loopback
  /^fc00:/i,                      // IPv6 unique local
  /^fe80:/i,                      // IPv6 link-local
  /^fd/i,                         // IPv6 private
];

const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal',
  'metadata.google',
];

/**
 * Validate a user-supplied URL for safe server-side fetching.
 * Returns the validated URL string or throws an Error.
 */
export function validateUrl(input: string): string {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ValidationError('Invalid URL format', 'url');
  }

  // Protocol whitelist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Only http and https protocols are allowed', 'protocol');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block known dangerous hostnames
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new ValidationError('Access to internal hosts is not allowed', 'host');
  }

  // Block IP-based access to private ranges
  for (const pattern of BLOCKED_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new ValidationError('Access to private/internal IP addresses is not allowed', 'ip');
    }
  }

  // Block cloud metadata IP explicitly
  if (hostname === '169.254.169.254') {
    throw new ValidationError('Access to cloud metadata endpoint is not allowed', 'endpoint');
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

  // Skip DNS check for IP literals (already checked by validateUrl)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith('[')) {
    return input;
  }

  try {
    const { address } = await dnsLookup(hostname);
    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(address)) {
        throw new ValidationError(`Hostname ${hostname} resolves to a private IP address`, 'hostname');
      }
    }
    if (address === '169.254.169.254') {
      throw new ValidationError(`Hostname ${hostname} resolves to cloud metadata endpoint`, 'hostname');
    }
  } catch (err) {
    if ((err as Error).message.includes('resolves to')) throw err;
    // DNS lookup failure — allow (may be transient), static check already passed
  }

  return input;
}
