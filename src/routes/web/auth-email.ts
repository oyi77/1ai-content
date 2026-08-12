/**
 * Web Routes — Email Authentication
 *
 * POST /auth/email/register       — register with email + password
 * POST /auth/email/login          — login with email + password
 * POST /auth/email/verify-email   — confirm email via token
 * POST /auth/email/forgot-password — request password reset
 * POST /auth/email/reset-password  — execute password reset
 * POST /auth/email/change-password — rotate password while logged in (JWT required)
 *
 * Keeps Telegram auth (auth.ts) fully intact. Email-only users get a
 * synthetic BigInt telegramId so all 17 child-model FKs continue to work.
 */

import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { UserCrudService } from "@/services/user-crud.service";
import { UserService } from "@/services/user.service";
import { emailService } from "@/utils/email";
import { getConfig } from "@/config/env";
import { logger } from "@/utils/logger";
import { authLimiter, authPasswordLimiter } from "@/middleware/rateLimit";

const SALT_ROUNDS = 10;

function getJwtSecret(): string {
  return getConfig().JWT_SECRET!;
}
function getJwtExpiresIn(): string {
  return getConfig().JWT_EMAIL_EXPIRES_IN;
}

export async function authEmailRoutes(server: FastifyInstance): Promise<void> {
  // ── POST /auth/email/register ──
  server.post(
    "/auth/email/register",
    { preHandler: authLimiter },
    async (request, reply) => {
      try {
        const { email, password, firstName } = (request.body ?? {}) as {
          email?: string;
          password?: string;
          firstName?: string;
        };

        if (!email || !password) {
          return reply
            .status(400)
            .send({ error: "Email and password are required" });
        }

        if (password.length < 6) {
          return reply
            .status(400)
            .send({ error: "Password must be at least 6 characters" });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return reply.status(400).send({ error: "Invalid email format" });
        }

        // Check if email already registered
        const existing = await UserCrudService.findByEmail(email);
        if (existing) {
          return reply.status(409).send({ error: "Email already registered" });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const displayName = firstName || email.split("@")[0];

        await UserCrudService.createEmailUser({
          email,
          passwordHash,
          firstName: displayName,
          verificationToken,
        });

        logger.info(`Email registration: ${email}`);

        // Send verification email (fire-and-forget; non-blocking)
        emailService
          .sendVerificationEmail(email, verificationToken)
          .catch((err) =>
            logger.warn("Failed to send verification email", { error: err }),
          );

        return {
          message:
            "Registration successful. Check your email for verification link.",
        };
      } catch (error) {
        logger.error("Email registration failed", { error });
        return reply.status(500).send({ error: "Registration failed" });
      }
    },
  );

  // ── POST /auth/email/login ──
  server.post(
    "/auth/email/login",
    { preHandler: authLimiter },
    async (request, reply) => {
      try {
        const { email, password } = (request.body ?? {}) as {
          email?: string;
          password?: string;
        };

        if (!email || !password) {
          return reply
            .status(400)
            .send({ error: "Email and password are required" });
        }

        const user = await UserCrudService.findByEmail(email);
        if (!user || !user.passwordHash) {
          return reply.status(401).send({ error: "Invalid email or password" });
        }

        if (user.isBanned) {
          return reply.status(403).send({ error: "Account suspended" });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          return reply.status(401).send({ error: "Invalid email or password" });
        }

        const token = jwt.sign(
          {
            userId: user.uuid,
            email: user.email,
            emailVerified: user.emailVerifiedAt !== null,
            telegramId: user.telegramId.toString(),
            tier: user.tier,
          },
          getJwtSecret(),
          { expiresIn: getJwtExpiresIn() as any },
        );

        return {
          token,
          user: {
            id: user.uuid,
            telegramId: user.telegramId.toString(),
            email: user.email,
            firstName: user.firstName,
            credits: user.creditBalance,
            tier: user.tier,
            emailVerified: user.emailVerifiedAt !== null,
          },
        };
      } catch (error) {
        logger.error("Email login failed", { error });
        return reply.status(500).send({ error: "Login failed" });
      }
    },
  );

  // ── POST /auth/email/verify-email ──
  server.post(
    "/auth/email/verify-email",
    { preHandler: authLimiter },
    async (request, reply) => {
      try {
        const { token } = (request.body ?? {}) as { token?: string };

        if (!token) {
          return reply
            .status(400)
            .send({ error: "Verification token is required" });
        }

        const user = await UserCrudService.findByVerificationToken(token);
        if (!user) {
          return reply
            .status(400)
            .send({ error: "Invalid or expired verification token" });
        }

        await UserCrudService.verifyEmail(user.email!);
        logger.info(`Email verified: ${user.email}`);

        return { message: "Email verified successfully" };
      } catch (error) {
        logger.error("Email verification failed", { error });
        return reply.status(500).send({ error: "Verification failed" });
      }
    },
  );

  // ── POST /auth/email/forgot-password ──
  server.post(
    "/auth/email/forgot-password",
    { preHandler: authPasswordLimiter },
    async (request, reply) => {
      try {
        const { email } = (request.body ?? {}) as { email?: string };

        if (!email) {
          return reply.status(400).send({ error: "Email is required" });
        }

        const user = await UserCrudService.findByEmail(email);
        if (!user) {
          // Don't reveal whether email exists
          return {
            message:
              "If the email is registered, a password reset link has been sent.",
          };
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await UserCrudService.setPasswordResetToken(
          email,
          resetToken,
          expiresAt,
        );

        emailService
          .sendPasswordResetEmail(email, resetToken)
          .catch((err) =>
            logger.warn("Failed to send password reset email", { error: err }),
          );

        return {
          message:
            "If the email is registered, a password reset link has been sent.",
        };
      } catch (error) {
        logger.error("Forgot password failed", { error });
        return reply.status(500).send({ error: "Request failed" });
      }
    },
  );

  // ── POST /auth/email/reset-password ──
  server.post(
    "/auth/email/reset-password",
    { preHandler: authPasswordLimiter },
    async (request, reply) => {
      try {
        const { token, password } = (request.body ?? {}) as {
          token?: string;
          password?: string;
        };

        if (!token || !password) {
          return reply
            .status(400)
            .send({ error: "Token and password are required" });
        }

        if (password.length < 6) {
          return reply
            .status(400)
            .send({ error: "Password must be at least 6 characters" });
        }

        const user = await UserCrudService.findByPasswordResetToken(token);
        if (!user) {
          return reply
            .status(400)
            .send({ error: "Invalid or expired reset token" });
        }

        if (
          user.passwordResetExpiresAt &&
          user.passwordResetExpiresAt < new Date()
        ) {
          return reply.status(400).send({ error: "Reset token has expired" });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        await UserCrudService.resetPassword(user.email!, passwordHash);

        return { message: "Password reset successfully" };
      } catch (error) {
        logger.error("Password reset failed", { error });
        return reply.status(500).send({ error: "Password reset failed" });
      }
    },
  );

  // ── POST /auth/email/change-password ──
  // Requires a valid email-auth JWT (Bearer). Rejects Telegram-native accounts
  // (passwordHash === null) and never echoes the hash back.
  server.post(
    "/auth/email/change-password",
    { preHandler: authPasswordLimiter },
    async (request, reply) => {
      try {
        const { currentPassword, newPassword } = (request.body ?? {}) as {
          currentPassword?: string;
          newPassword?: string;
        };

        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({ error: "Unauthorized" });
        }

        let decoded: { userId?: string };
        try {
          decoded = jwt.verify(authHeader.substring(7), getJwtSecret()) as {
            userId?: string;
          };
        } catch {
          return reply.status(401).send({ error: "Invalid token" });
        }

        if (!currentPassword || !newPassword) {
          return reply
            .status(400)
            .send({ error: "Current and new password are required" });
        }

        if (newPassword.length < 6) {
          return reply
            .status(400)
            .send({ error: "Password must be at least 6 characters" });
        }

        const user = await UserService.findByUuid(decoded.userId!);
        if (!user) {
          return reply.status(404).send({ error: "User not found" });
        }

        if (user.passwordHash === null) {
          return reply
            .status(400)
            .send({ error: "No email password set for this account" });
        }

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) {
          return reply
            .status(401)
            .send({ error: "Current password is incorrect" });
        }

        const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await UserCrudService.resetPassword(user.email!, passwordHash);

        return { message: "Password changed successfully" };
      } catch (error) {
        logger.error("Change password failed", { error });
        return reply.status(500).send({ error: "Password change failed" });
      }
    },
  );
}
