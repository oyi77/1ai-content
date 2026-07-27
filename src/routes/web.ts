/**
 * Web Routes — Aggregator
 *
 * Assembles all sub-route modules into a single register function.
 * Previously a 1423-line god object, now split into 8 domain-focused files.
 *
 * Sub-modules:
 *   pages.ts         — Landing, FAQ, TOS, Privacy, static files, PWA
 *   auth.ts          — POST /auth/telegram
 *   user.ts          — /api/user CRUD, /api/user/videos, /api/user/history, /api/video/:jobId
 *   content.ts       — /api/storyboard, /api/video/create, /api/video/analyze, /api/image/*, /video/:jobId/download
 *   finance.ts       — /api/packages, /api/payment, /api/transactions, /api/referral, /api/p2p, /api/subscriptions
 *   chat.ts          — /api/chat/landing
 *   aliases.ts       — /api/v1/* redirects
 *   middleware.ts    — getUser helper (shared)
 */

import { FastifyInstance } from "fastify";
import { pageRoutes } from "./web/pages";
import { authRoutes } from "./web/auth";
import { userRoutes } from "./web/user";
import { contentRoutes } from "./web/content";
import { financeRoutes } from "./web/finance";
import { chatRoutes } from "./web/chat";
import { aliasRoutes } from "./web/aliases";

export async function webRoutes(server: FastifyInstance): Promise<void> {
  await Promise.all([
    pageRoutes(server),
    authRoutes(server),
    userRoutes(server),
    contentRoutes(server),
    financeRoutes(server),
    chatRoutes(server),
    aliasRoutes(server),
  ]);
}
