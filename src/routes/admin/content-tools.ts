import { FastifyInstance } from "fastify";
import { prisma } from "@/config/database";
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

  // Bookshelf AI Book Generator
  server.get("/admin/bookshelf", async (_request, reply) => {
    return reply.view(
      "admin/bookshelf.ejs",
      { ...trackingVars(), activePage: "bookshelf", title: "AI Book Generator" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Comic/Manga/Manhwa Generator
  server.get("/admin/comic", async (_request, reply) => {
    return reply.view("admin/comic.ejs", {
      ...trackingVars,
      activePage: "comic",
    });
  });

  // ========== Bookshelf API ==========

  // Save a generated book
  server.post("/api/books", async (request, reply) => {
    const { title, subject, full_markdown, sections, stats } =
      request.body as {
        title: string;
        subject?: string;
        full_markdown: string;
        sections?: unknown;
        stats?: unknown;
      };
    if (!title || !full_markdown) {
      return reply.status(400).send({ error: "title and full_markdown required" });
    }
    const book = await prisma.book.create({
      data: {
        title,
        subject: subject || title,
        fullMarkdown: full_markdown,
        sections: sections || undefined,
        stats: stats || undefined,
      },
    });
    return reply.status(201).send(book);
  });

  // List all books
  server.get("/api/books", async (_request, reply) => {
    const books = await prisma.book.findMany({
      orderBy: { createdAt: "desc" },
    });
    return reply.send(books);
  });

  // Get a single book
  server.get<{ Params: { id: string } }>("/api/books/:id", async (request, reply) => {
    const { id } = request.params;
    const book = await prisma.book.findUnique({
      where: { id: Number(id) },
    });
    if (!book) {
      return reply.status(404).send({ error: "Book not found" });
    }
    return reply.send(book);
  });
}

