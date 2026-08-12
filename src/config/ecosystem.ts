/**
 * Ecosystem Integration Config
 *
 * URLs and API keys for inter-service communication.
 * All values loaded from environment variables.
 */

export interface EcosystemConfig {
  social: {
    baseUrl: string;
    apiKey: string;
  };
  affiliate: {
    baseUrl: string;
    apiKey: string;
  };
}

let _ecosystem: EcosystemConfig | null = null;

export function getEcosystemConfig(): EcosystemConfig {
  if (_ecosystem) return _ecosystem;

  _ecosystem = {
    social: {
      baseUrl: process.env.SOCIAL_SERVICE_URL || "http://127.0.0.1:8200",
      apiKey: process.env.SOCIAL_SERVICE_KEY || "",
    },
    affiliate: {
      baseUrl: process.env.AFFILIATE_SERVICE_URL || "http://127.0.0.1:3001",
      apiKey: process.env.AFFILIATE_SERVICE_KEY || "",
    },
  };

  return _ecosystem;
}

/**
 * Generate HMAC signature for inter-service auth
 */
export function generateServiceSignature(
  serviceName: string,
  timestamp: string,
  body: string,
  secret: string,
): string {
  const crypto = require("crypto");
  const payload = `${serviceName}:${timestamp}:${body}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Create auth headers for inter-service requests
 */
export function createServiceHeaders(
  serviceName: "1ai-content",
  body: unknown,
  secret: string,
): Record<string, string> {
  const timestamp = Date.now().toString();
  const bodyStr = JSON.stringify(body);
  const signature = generateServiceSignature(
    serviceName,
    timestamp,
    bodyStr,
    secret,
  );

  return {
    "Content-Type": "application/json",
    "X-Service-Key": secret,
    "X-Service-Name": serviceName,
    "X-Timestamp": timestamp,
    "X-Signature": signature,
  };
}
