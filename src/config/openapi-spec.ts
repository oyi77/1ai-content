/**
 * OpenAPI 3.0 Specification — OpenClaw Bot API
 *
 * Lightweight API documentation for the public-facing endpoints.
 * For full Swagger UI integration, install @fastify/swagger and @fastify/swagger-ui.
 *
 * Key endpoints documented:
 * - Web app routes (landing, FAQ, terms)
 * - User API (auth, profile, videos, transactions)
 * - Generation API (storyboard, video, image)
 * - Webhooks (payment notifications)
 */

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "OpenClaw Bot API",
    description: "AI-powered video generation SaaS platform. Telegram bot + web dashboard + REST API.",
    version: "3.0.0",
    contact: {
      name: "OpenClaw Support",
      url: "https://docs.openclaw.ai",
    },
  },
  servers: [
    { url: "https://api.openclaw.ai", description: "Production" },
    { url: "http://localhost:3000", description: "Local development" },
  ],
  tags: [
    { name: "Web", description: "Public web pages (landing, FAQ, terms)" },
    { name: "Auth", description: "Telegram authentication" },
    { name: "User", description: "User profile and account management" },
    { name: "Videos", description: "Video generation, listing, and management" },
    { name: "Images", description: "Image generation and analysis" },
    { name: "Storyboard", description: "AI storyboard generation" },
    { name: "Payments", description: "Packages, transactions, and P2P transfers" },
    { name: "Referral", description: "Referral and affiliate system" },
    { name: "Webhooks", description: "Payment gateway webhooks (Tripay, DuitKu, NOWPayments, Midtrans, Telegram Stars)" },
    { name: "Health", description: "Health check endpoints" },
  ],
  paths: {
    "/": {
      get: {
        tags: ["Web"],
        summary: "Landing page",
        description: "Returns the marketing landing page with current package pricing.",
        responses: { "200": { description: "HTML landing page" } },
      },
    },
    "/faq": {
      get: { tags: ["Web"], summary: "FAQ page", responses: { "200": { description: "HTML" } } },
    },
    "/terms": {
      get: { tags: ["Web"], summary: "Terms of service", responses: { "200": { description: "HTML" } } },
    },
    "/privacy": {
      get: { tags: ["Web"], summary: "Privacy policy", responses: { "200": { description: "HTML" } } },
    },
    "/auth/telegram": {
      post: {
        tags: ["Auth"],
        summary: "Authenticate via Telegram initData",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["initData"],
                properties: {
                  initData: { type: "string", description: "Telegram Mini App initData string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Session created", content: { "application/json": { schema: { type: "object", properties: { token: { type: "string" } } } } } },
          "401": { description: "Invalid initData" },
        },
      },
    },
    "/api/user": {
      delete: {
        tags: ["User"],
        summary: "Delete user account (GDPR)",
        responses: { "200": { description: "Account deleted" } },
      },
    },
    "/api/user/videos": {
      get: {
        tags: ["Videos"],
        summary: "List user's videos",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "Array of video records" } },
      },
    },
    "/api/user/history": {
      get: {
        tags: ["Videos"],
        summary: "List user's generation history",
        responses: { "200": { description: "Array of history records" } },
      },
    },
    "/api/video/{jobId}": {
      delete: {
        tags: ["Videos"],
        summary: "Soft-delete a video (move to trash)",
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Video moved to trash" } },
      },
    },
    "/api/video/{jobId}/status": {
      get: {
        tags: ["Videos"],
        summary: "Get video generation status",
        parameters: [{ name: "jobId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Video status and progress" } },
      },
    },
    "/api/video/analyze": {
      post: {
        tags: ["Videos"],
        summary: "Analyze a video for content insights",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { url: { type: "string" } } } } },
        },
        responses: { "200": { description: "Analysis result" } },
      },
    },
    "/api/image/describe": {
      post: {
        tags: ["Images"],
        summary: "Generate image description/prompt from uploaded image",
        responses: { "200": { description: "Generated description" } },
      },
    },
    "/api/storyboard": {
      post: {
        tags: ["Storyboard"],
        summary: "Generate an AI storyboard for a video",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["niche", "duration"],
                properties: {
                  niche: { type: "string", example: "fnb" },
                  duration: { type: "integer", example: 15 },
                  productDescription: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Storyboard scenes" } },
      },
    },
    "/api/packages": {
      get: {
        tags: ["Payments"],
        summary: "List available credit packages",
        responses: { "200": { description: "Array of package definitions" } },
      },
    },
    "/api/my/transactions": {
      get: {
        tags: ["Payments"],
        summary: "List user's transaction history",
        responses: { "200": { description: "Array of transactions" } },
      },
    },
    "/api/my/transactions/{id}/receipt": {
      get: {
        tags: ["Payments"],
        summary: "Download transaction receipt",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Receipt PDF/image" } },
      },
    },
    "/api/user/p2p-transfer": {
      post: {
        tags: ["Payments"],
        summary: "Transfer credits to another user (P2P)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { recipientId: { type: "string" }, amount: { type: "number" } } } } },
        },
        responses: { "200": { description: "Transfer completed" } },
      },
    },
    "/api/referral": {
      get: {
        tags: ["Referral"],
        summary: "Get user's referral info and stats",
        responses: { "200": { description: "Referral code, count, commissions" } },
      },
    },
    "/payment/finish": {
      get: {
        tags: ["Webhooks"],
        summary: "Payment gateway redirect URL (user lands here after payment)",
        responses: { "200": { description: "HTML confirmation page" } },
      },
    },
  },
  components: {
    securitySchemes: {
      TelegramAuth: {
        type: "apiKey",
        in: "header",
        name: "X-Telegram-Init-Data",
        description: "Telegram Mini App initData for authentication",
      },
    },
  },
};
