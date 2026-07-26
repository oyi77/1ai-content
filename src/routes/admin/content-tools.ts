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
    return reply.view(
      "admin/comic.ejs",
      { ...trackingVars(), activePage: "comic", title: "Comic Generator" },
      { layout: "admin/layout.ejs" },
    );
  });

  // Movie / Short-Film Generator
  server.get("/admin/movie", async (_request, reply) => {
    return reply.view(
      "admin/movie.ejs",
      { ...trackingVars(), activePage: "movie", title: "Movie Generator" },
      { layout: "admin/layout.ejs" },
    );
  });

  // TTS Voice Generator
  server.get("/admin/tts", async (_request, reply) => {
    return reply.view("admin/tts.ejs", { layout: "admin/layout.ejs", activePage: "tts", title: "TTS Voice Generator", ...trackingVars() });
  });
  // Music Generator (Suno + MusicGen)
  server.get("/admin/music", async (_request, reply) => {
    return reply.view("admin/music.ejs", { layout: "admin/layout.ejs", activePage: "music", title: "Music Generator", ...trackingVars() });
  });
  // Looping Video Generator
  server.get("/admin/looping", async (_request, reply) => {
    return reply.view("admin/looping.ejs", { layout: "admin/layout.ejs", activePage: "looping", title: "Looping Video", ...trackingVars() });
  });
  // Autopilot Content Jobs
  server.get("/admin/autopilot", async (_request, reply) => {
    return reply.view("admin/autopilot.ejs", { layout: "admin/layout.ejs", activePage: "autopilot", title: "Autopilot", ...trackingVars() });
  });
  // Channel Analysis
  server.get("/admin/analyze", async (_request, reply) => {
    return reply.view("admin/analyze.ejs", { layout: "admin/layout.ejs", activePage: "analyze", title: "Channel Analysis", ...trackingVars() });
  })

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

  // ========== Comic API ==========

  // Save a generated comic
  server.post("/api/comics", async (request, reply) => {
    const { title, format, language, prompt, script, num_episodes, total_pages, output_dir, cover_path, stats } =
      request.body as {
        title: string;
        format?: string;
        language?: string;
        prompt: string;
        script?: unknown;
        num_episodes?: number;
        total_pages?: number;
        output_dir?: string;
        cover_path?: string;
        stats?: unknown;
      };
    if (!title || !prompt) {
      return reply.status(400).send({ error: "title and prompt required" });
    }
    const comic = await prisma.comic.create({
      data: {
        title,
        format: format || "comic",
        language: language || "en",
        prompt,
        script: script || undefined,
        numEpisodes: num_episodes || 1,
        totalPages: total_pages || 0,
        outputDir: output_dir || undefined,
        coverPath: cover_path || undefined,
        stats: stats || undefined,
      },
    });
    return reply.status(201).send(comic);
  });

  // List all comics
  server.get("/api/comics", async (_request, reply) => {
    const comics = await prisma.comic.findMany({
      orderBy: { createdAt: "desc" },
    });
    return reply.send(comics);
  });

  // Get a single comic
  server.get<{ Params: { id: string } }>("/api/comics/:id", async (request, reply) => {
    const { id } = request.params;
    const comic = await prisma.comic.findUnique({
      where: { id: Number(id) },
    });
    if (!comic) {
      return reply.status(404).send({ error: "Comic not found" });
    }
    return reply.send(comic);
  });

  // ========== Movie API ==========

  // Save a generated movie
  server.post("/api/movies", async (request, reply) => {
    const { title, genre, num_scenes, duration, prompt, script, video_path, cover_path, output_dir, stats, status, metadata } =
      request.body as {
        title: string;
        genre?: string;
        num_scenes?: number;
        duration?: number;
        prompt: string;
        script?: unknown;
        video_path?: string;
        cover_path?: string;
        output_dir?: string;
        stats?: unknown;
        status?: string;
        metadata?: unknown;
      };
    if (!title || !prompt) {
      return reply.status(400).send({ error: "title and prompt required" });
    }
    const movie = await prisma.movie.create({
      data: {
        title,
        genre: genre || "general",
        numScenes: num_scenes || 8,
        duration: duration || 0,
        prompt,
        script: script || undefined,
        videoPath: video_path || undefined,
        coverPath: cover_path || undefined,
        outputDir: output_dir || undefined,
        stats: stats || undefined,
        status: status || "completed",
        metadata: metadata || undefined,
      },
    });
    return reply.status(201).send(movie);
  });

  // List all movies
  server.get("/api/movies", async (_request, reply) => {
    const movies = await prisma.movie.findMany({
      orderBy: { createdAt: "desc" },
    });
    return reply.send(movies);
  });

  // Get a single movie
  server.get<{ Params: { id: string } }>("/api/movies/:id", async (request, reply) => {
    const { id } = request.params;
    const movie = await prisma.movie.findUnique({
      where: { id: Number(id) },
    });
    if (!movie) {
      return reply.status(404).send({ error: "Movie not found" });
    }
    return reply.send(movie);
  });
}

