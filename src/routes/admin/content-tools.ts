import { FastifyInstance } from "fastify";
import { trackingVars } from "./shared";

export async function registerContentToolsRoutes(server: FastifyInstance) {
  // Captions manager
  server.get("/admin/captions", async (_request, reply) => {
    return reply.view(
      "admin/captions.ejs",
      { ...trackingVars(), activePage: "captions", title: "Captions Manager" },
      { layout: "admin/layout.ejs" },
    );
  });

  // CloakBrowser manager
  server.get("/admin/cloak", async (_request, reply) => {
    return reply.view(
      "admin/cloak.ejs",
      { ...trackingVars(), activePage: "cloak", title: "CloakBrowser Manager" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Engagement manager
  server.get("/admin/engagement", async (_request, reply) => {
    return reply.view(
      "admin/engagement.ejs",
      { ...trackingVars(), activePage: "engagement", title: "Engagement Manager" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Video tools
  server.get("/admin/video-tools", async (_request, reply) => {
    return reply.view(
      "admin/video-tools.ejs",
      { ...trackingVars(), activePage: "video-tools", title: "Video Tools" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Ad renderer
  server.get("/admin/render-ad", async (_request, reply) => {
    return reply.view(
      "admin/render-ad.ejs",
      { ...trackingVars(), activePage: "render-ad", title: "Ad Renderer" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Storyboard creator
  server.get("/admin/storyboard", async (_request, reply) => {
    return reply.view(
      "admin/storyboard.ejs",
      { ...trackingVars(), activePage: "storyboard", title: "Storyboard Creator" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Pinterest → Facebook pipeline
  server.get("/admin/pinterest", async (_request, reply) => {
    return reply.view(
      "admin/pinterest.ejs",
      { ...trackingVars(), activePage: "pinterest", title: "Pinterest → Facebook" },
      { layout: "admin/layout.ejs" },
    );
  });
}
