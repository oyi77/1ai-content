/**
 * Email Service
 *
 * Interface-first design — swap ConsoleEmailService for a real provider
 * (nodemailer, SendGrid, etc.) when ready, without touching auth routes.
 */

export interface EmailService {
  sendVerificationEmail(to: string, token: string): Promise<void>;
  sendPasswordResetEmail(to: string, token: string): Promise<void>;
}

/**
 * Console-based email service (MVP).
 *
 * Logs verification/reset URLs to the console.
 * Replace with a real SMTP/API provider when available.
 */
export class ConsoleEmailService implements EmailService {
  private get baseUrl(): string {
    return process.env.WEB_APP_URL || "http://localhost:3000";
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const url = `${this.baseUrl}/verify-email?token=${token}`;
    console.log(
      `[EMAIL NOT SENT — console-only service, no SMTP] Verification for ${to}: ${url}`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const url = `${this.baseUrl}/reset-password?token=${token}`;
    console.log(
      `[EMAIL NOT SENT — console-only service, no SMTP] Password reset for ${to}: ${url}`,
    );
  }
}

/** Singleton — swap the class to switch provider */
export const emailService: EmailService = new ConsoleEmailService();
