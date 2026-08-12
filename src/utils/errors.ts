/**
 * Actionable Error Messages
 *
 * Maps raw error strings to user-friendly, actionable messages
 * so users always know what to do next.
 */

export interface ActionableErrorContext {
  jobId?: string;
  credits?: number;
  cost?: number;
}

/**
 * Convert a raw error string into a user-friendly message with
 * clear next steps the user can take.
 */
export function actionableError(
  error: string,
  context?: ActionableErrorContext,
): string {
  const lower = error.toLowerCase();

  // Insufficient credits
  if (
    lower.includes("insufficient credits") ||
    lower.includes("not enough credits")
  ) {
    const balancePart =
      context?.credits !== undefined && context?.cost !== undefined
        ? `\nCurrent: ${context.credits} | Needed: ${context.cost}\n`
        : "";
    return (
      `Insufficient credits.${balancePart}\n` +
      `Use /topup to buy credits instantly, or /subscription for monthly plans (better value!).`
    );
  }

  // Timeouts / poll timeouts
  if (
    lower.includes("timeout") ||
    lower.includes("poll timeout") ||
    lower.includes("timed out")
  ) {
    return "Taking longer than usual. We are retrying automatically -- you will be notified when your video is ready.";
  }

  // Rate limiting
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("429")
  ) {
    return "Too many requests. Please wait a moment and try again.";
  }

  // Generation failure (generic provider errors)
  if (
    lower.includes("generation failed") ||
    lower.includes("generation error") ||
    lower.includes("provider") ||
    lower.includes("all providers")
  ) {
    return "Our AI service is temporarily busy. Your credits have been refunded. Please try again in a few minutes with /create.";
  }

  // Reference image errors
  if (
    lower.includes("reference image") ||
    lower.includes("image download") ||
    lower.includes("image upload") ||
    lower.includes("image could") ||
    lower.includes("failed to download reference")
  ) {
    return "The image could not be processed. Please try a different image, or use /skip to generate without a reference.";
  }

  // Network / connection errors
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return "A network error occurred. Please try again in a moment.";
  }

  // Default fallback
  return "Something unexpected happened. Please try again or contact @codergaboets for help.";
}
