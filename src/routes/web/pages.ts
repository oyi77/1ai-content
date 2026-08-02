/**
 * Web Routes — Static Pages & EJS Views
 *
 * Landing page, FAQ, TOS, Privacy, payment finish, favicon, PWA,
 * and other non-API routes.
 */

import { FastifyInstance } from "fastify";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "@/config/database";
import { getConfig } from "@/config/env";
import { getPackagesAsync } from "@/config/pricing";

interface Testimonial {
  stars?: number;
  text: string;
  name?: string;
  role?: string;
  avatar?: string;
}

export async function pageRoutes(server: FastifyInstance): Promise<void> {
  // ── Landing (React SPA via admin-ui single bundle) ──
  const LANDING_INDEX = path.join(process.cwd(), "admin-ui", "dist", "index.html");
  if (fs.existsSync(LANDING_INDEX)) {
    server.get("/", async (_request, reply) => {
      // Baca per-request agar hasil rebuild admin-ui langsung terlihat tanpa restart
      const landingHtml = fs.readFileSync(LANDING_INDEX, "utf-8");
      return reply.type("text/html").send(landingHtml);
    });
  } else {
    // Fallback: render EJS landing if React build not present
    server.get("/", async (request, reply) => {
      const { redis } = require("../../config/redis");
      let landingConfig: Record<string, unknown> = {};
      try {
        const data = await redis.get("admin:landing_config");
        if (data) landingConfig = JSON.parse(data);
      } catch {
        /* ignore */
      }

      const packages = await getPackagesAsync();

      const langParam = (request.query as Record<string, string>).lang;
      const acceptLang = request.headers["accept-language"] || "";
      let currentLang = langParam || (acceptLang.startsWith("en") ? "en" : "id");
      if (!["id", "en"].includes(currentLang)) currentLang = "id";

      let testimonials = [];
      if (landingConfig.testimonials) {
        if (Array.isArray(landingConfig.testimonials)) {
          testimonials = landingConfig.testimonials;
        } else if (typeof landingConfig.testimonials === "object") {
          const lc = landingConfig.testimonials as Record<string, unknown>;
          testimonials = (lc[currentLang] || lc["id"] || []) as Array<Testimonial>;
        }
      }

      return reply.view("web/landing.ejs", {
        landingConfig,
        testimonials,
        packages,
        currentLang,
        botUsername: getConfig().BOT_USERNAME || "vilona_content_bot",
        siteUrl: getConfig().WEBHOOK_URL || 'https://saas.aitradepulse.com',
        fbPixelId: getConfig().FACEBOOK_PIXEL_ID || "",
        ga4Id: getConfig().GA4_TRACKING_ID || "",
        ttPixelId: getConfig().TIKTOK_PIXEL_ID || "",
        ogImageUrl: landingConfig?.heroImageUrl || landingConfig?.ogImageUrl || null,
      });
    });
  }

  // ── FAQ ──
  server.get("/faq", async (_request, reply) => {
    return reply.view("web/faq.ejs", { botUsername: getConfig().BOT_TOKEN?.split(':')[0] || 'bot' });
  });

  // ── Terms of Service ──
  server.get("/terms", async (_request, reply) => {
    return reply.view("web/tos.ejs", {
      botUsername: getConfig().BOT_USERNAME || "vilona_content_bot",
    });
  });

  // ── Privacy Policy ──
  server.get("/privacy", async (_request, reply) => {
    return reply.view("web/privacy.ejs", {
      botUsername: getConfig().BOT_USERNAME || "vilona_content_bot",
    });
  });

  // Facebook domain verification
  server.get("/go7u73s641jq2jtd8gfh2ecbl94kmy.html", async (_request, reply) => {
    reply.type("text/html").send("go7u73s641jq2jtd8gfh2ecbl94kmy");
  });

  // Favicon routes
  server.get("/favicon.ico", async (_request, reply) => {
    const ico = fs.readFileSync(`${process.cwd()}/src/public/favicon.ico`);
    return reply.type("image/x-icon").send(ico);
  });

  server.get("/favicon.svg", async (_request, reply) => {
    const svg = fs.readFileSync(`${process.cwd()}/src/public/favicon.svg`, "utf8");
    return reply.type("image/svg+xml").send(svg);
  });

  // Payment finish page
  server.get("/payment/finish", async (request, reply) => {
    const { order_id } = request.query as Record<string, string>;
    let statusMessage = "Payment is being processed";
    let statusIcon = "⏳";
    let statusClass = "pending";
    if (order_id) {
      try {
        const tx = await prisma.transaction.findFirst({
          where: { orderId: String(order_id) },
          select: { status: true },
        });
        if (tx?.status === "success") {
          statusMessage = "Payment successful! Credits added to your account.";
          statusIcon = "✅";
          statusClass = "success";
        } else if (tx?.status === "failed") {
          statusMessage = "Payment failed. Please try again or contact support.";
          statusIcon = "❌";
          statusClass = "failed";
        }
      } catch { /* ignore */ }
    }
    const botUsername = getConfig().BOT_USERNAME || "vilona_content_bot";
    return reply.type("text/html")
      .send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Status</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:white;border-radius:16px;padding:40px;text-align:center;max-width:400px;box-shadow:0 4px 24px rgba(0,0,0,.1)}.icon{font-size:48px;margin-bottom:16px}.success{color:#16a34a}.pending{color:#d97706}.failed{color:#dc2626}.btn{display:inline-block;padding:12px 24px;border-radius:8px;text-decoration:none;margin:8px;font-weight:600}.btn-primary{background:#2563eb;color:white}.btn-secondary{background:#e5e7eb;color:#374151}</style></head>
<body><div class="card"><div class="icon">${statusIcon}</div><h2 class="${statusClass}">${statusMessage}</h2><p><a class="btn btn-primary" href="https://t.me/${botUsername}">Return to Bot</a></p><p><a class="btn btn-secondary" href="/app">Open Web App</a></p></div></body></html>`);
  });

  // Web app
  // Web app - redirect to React SPA
  server.get("/app", async (_request, reply) => {
    return reply.redirect("/app/");
  });

  // ── PWA Manifest ──
  server.get("/manifest.json", async (_request, reply) => {
    return reply.type('application/json').send({
      name: '1AI Content',
      short_name: '1AI Content',
      start_url: '/app',
      display: 'standalone',
      background_color: '#0a0a1a',
      theme_color: '#00d9ff',
      icons: [
        { src: '/public/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/public/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  });

  // ── Dashboard HTML ──
  server.get("/dashboard.html", async (_request, reply) => {
    const dashboardPath = path.join(process.cwd(), "public", "dashboard.html");
    if (fs.existsSync(dashboardPath)) {
      return reply.type("text/html").send(fs.readFileSync(dashboardPath, "utf-8"));
    }
    return reply.status(404).send({ error: "Dashboard not found" });
  });

  // ── Service Worker ──
  server.get("/sw.js", async (_request, reply) => {
    const swPath = path.join(process.cwd(), "public", "sw.js");
    if (fs.existsSync(swPath)) {
      return reply.type("application/javascript").send(fs.readFileSync(swPath, "utf-8"));
    }
    return reply.status(404).send({ error: "Service worker not found" });
  });

  // ── Telegram Mini App ──
  server.get("/app/mini", async (_request, reply) => {
    const miniPath = path.join(process.cwd(), "public", "miniapp.html");
    if (fs.existsSync(miniPath)) {
      return reply.type("text/html").send(fs.readFileSync(miniPath, "utf-8"));
    }
    return reply.status(404).send({ error: "Mini app not found" });
  });
}
